'use strict';
const path = require('path');
const fs = require('fs-extra');
const q = require('q');
const webPackLib = require('webpack');
const exec = require('child_process').exec;

//******************** EXPORTED **********************************************
module.exports.createDistribution = function(){
    require('dotenv').config({path: path.join(process.env.PACKGIT_SOURCE, '.packgit') });
    checkEnvVariables();
    logData("------======== Pack-Git ============------", 0);
    logData("PackGit Running on the Project At: " + process.env.PACKGIT_SOURCE, 0);
    logData("Deploying to Branch:: " + process.env.PACKGIT_BRANCH, 0);
    logData("------==============================------", 0);
    return prepareDistFolder().then(getFunctionFolders).then(cycleThroughFolders).then(gitAddCommit);
}

function cycleThroughFolders(results){
    logData("Start cycleThroughFolders", 1);
    var deferred = q.defer();
    var creationResults = [];
    var top_folders = results.top_folders;
    for(var x = 0; x < top_folders.length; x++){
        logData("Start Folder:" + top_folders[x], 3);
        creationResults.push(catalogDependencyFiles(top_folders[x]));
    }
    q.allSettled(creationResults).then(createDependencyFileJS).then(createDependencyFile).then(function(output){
        webPackIt(webPackLib).then(
            function(results){
                logData("Processing WebPack Results", 3);
                var exclude = Array.from(new Set(output.indexes.concat(results.webpackedFiles)));
                copyDist(exclude).then(function(results){
                    deferred.resolve(results);
                }, function(error){
                    deferred.reject({success: false, action: "copyDist", error: { message: err.message, object: error }});
                })

            }).catch(function(error){
                if(error.error)
                    error = error.error;
                deferred.reject({success: false, action: "webPackIt", error: { message: error.message, object: error }});
            });
    }).catch(function(err){
        deferred.reject({success: false, action: "prepWork", error: { message: err.message, stack: (err.stack) ? err.stack : 'N/A' } });
    });
    return deferred.promise;
}


/**
 * prepareDistFolder - Removes the prior dist folder, recreates it, copies over the .git directory, and sets the branch to value of ENV var PACKGIT_BRANCH before
 * the other operations run, so that everything is ready to go.
 * @returns {*|promise|h} - Resolves to success : "true" with the output of the git command on success, rejects to success : false.
 */
function prepareDistFolder(){
    logData("Start Prepare Dist Folder", 1)
    var deferred = q.defer();
    var dist = path.join(process.env.PACKGIT_SOURCE, process.env.PACKGIT_OUTPUT_FOLDER);
    var commands =  [ 'git fetch origin', 'git stash', 'git checkout ' + process.env.PACKGIT_BRANCH, 'git clean -df', 'git pull' ];
    var settings = {cwd: dist};
    var execResult = null;
    initDist(dist).then(execCommands.bind(this,commands, settings)).then(function(){
        deferred.resolve(true);
    }).catch(function(failed){
        var error = failed.error;
        //If failed due to branch not existing, create it.
        if(error.message && error.message.indexOf("'" + process.env.PACKGIT_BRANCH + "' did not match any") >= 0 ){
            execCommands(['git checkout --orphan ' + process.env.PACKGIT_BRANCH, 'git reset', 'git clean -df'], settings).then(function(){
                deferred.resolve(true);
            }, function(error){
                deferred.reject(error);
            })
        } else {
            deferred.reject(error);
        }
    });
    return deferred.promise;
}

/**
 * initDist - Initializes the Dist directory by clearing it and copying over the .git directory.
 * @param folder - The folder to initialize
 * @returns {promise} - Resolve - True
 *                      Reject - Error causing the failure.
 */
function initDist(folder){
    logData("Start initDist", 1);
    var deferred = q.defer();
    fs.emptyDir(folder, function(err){
        if(err)
            deferred.reject(err);
        else
            fs.copy(path.join(process.env.PACKGIT_SOURCE, ".git"), path.join(folder, ".git"), function (err) {
                if (err)
                    deferred.reject(err);
                else
                    deferred.resolve(true)
            });
    });
    return deferred.promise;
}


/**
 * execCommand - Promisifies the "exec" command
 * @param command - String - The command
 * @param settings - Object - Settings for Exec
 * @returns {promise} - Resolve - On Success - Object {command: command, settings: settings, error: error, stdout: stdout, stderr: stderr}
 *                      Reject - On Failure - Object {command: command, settings: settings, error: error, stdout: stdout, stderr: stderr}
 */
function execCommand(command, settings){
    logData("Start execCommand", 1);
    var deferred = q.defer();
    logData("Executing the command:" + command, 3);
    exec(command, settings, function(error, stdout, stderr) {
        if (error) {
            deferred.reject({command: command, settings: settings, error: error, stdout: stdout, stderr: stderr})
        } else {
            deferred.resolve({command: command, settings: settings, error: error, stdout: stdout, stderr: stderr})
        }
    });
    return deferred.promise;
}


/**
 * execCommands - Run a series of commands and return their results.
 * @param commands - String or Array of commands to run
 * @param settings - Settings for Exec
 * @returns {promise} - Resolve - Last command {command: command, settings: settings, error: error, stdout: stdout, stderr: stderr}
 *                      Reject  - {command: command, settings: settings, error: error, stdout: stdout, stderr: stderr}
 */
function execCommands(commands, settings){
    logData("Start ExecCommands", 1);
    var results = [];
    if(typeof commands === 'string')
        commands = [commands];

    var result = q();
    commands.map(function(command){
        return execCommand.bind(this, command, settings);
    }).forEach(function (command) {
        result = result.then(command);
    });
    return result;
}


function webPackIt(webPackLib){
    logData("Start webPackIt", 1)
    const deferred = q.defer();
    const outputDir = path.join(process.env.PACKGIT_SOURCE, process.env.PACKGIT_OUTPUT_FOLDER);
    logData("Running Webpack...", 0);
    const toIgnore = JSON.parse(process.env.PACKGIT_IGNORED_MODULES);
    var excludes = {};
    for (var x = 0; x < toIgnore.length; x++){
        excludes[toIgnore[x]] = true;
    }
    logData(excludes, 6);
    var compiler = webPackLib({
        entry: path.join(process.env.PACKGIT_SOURCE, process.env.PACKGIT_OUTPUT_LIBRARY),
        target: 'node',
        output : {
            path : path.join(process.env.PACKGIT_SOURCE, process.env.PACKGIT_OUTPUT_FOLDER),
            filename : process.env.PACKGIT_OUTPUT_LIBRARY,
            library: "index",
            libraryTarget: "commonjs2"
        },
        externals: excludes,
        node: {
            __filename: false,
            __dirname: false
        },
        plugins: [/*
            new webPackLib.optimize.UglifyJsPlugin({
                compress: {
                    warnings: false,
                },
                output: {
                    comments: false,
                }
            })//*/
        ],
        module: {
            loaders: [{
                test: /\.json$/,
                loader: 'json-loader'
            }]
        }
    }, function(err, stats) {
        //Delete the temp file once created
        try {
            if(process.env.LogLevel != 10)//Only delete if not debugging
                fs.unlinkSync(path.join(process.env.PACKGIT_SOURCE, process.env.PACKGIT_OUTPUT_LIBRARY));
        } catch (error){
            if(error.code !== "ENOENT")
                err = error;
        }
        if(err){
            logError(err, "WebPackIt");
            deferred.reject({success: false, error : err});
        }
        var jsonStats = stats.toJson();
        if(jsonStats.errors.length > 0){
            logError(JSON.stringify(jsonStats.errors), "WebPackIt-JSONStats");
            deferred.reject({success: false, error : jsonStats.errors});
        }
        const webpackedFiles = jsonStats.modules.reduce(function(acc, module){
            if(module.identifier.indexOf(path.sep) >=0 && module.identifier.indexOf("node_modules") < 0)
                acc.push(module.identifier);
            return acc;
        }, []);

        if(jsonStats.warnings.length > 0){
            logData("WebPackIt-JSONStats: WARNING:" + JSON.stringify(jsonStats.warnings), 2);
            deferred.resolve({success : true, warnings : jsonStats.warnings, webpackedFiles: webpackedFiles});
        }

        deferred.resolve({success : true, webpackedFiles: webpackedFiles});
    });

    return deferred.promise;
}

function getFoldersToCopy(excludeFiles){
    logData("Start getFoldersToCopy", 1);
    const deferred = q.defer();
    const excludeFolders = JSON.parse(process.env.PACKGIT_EXCLUDED_ITEMS);

    walk(process.env.PACKGIT_SOURCE, function(err, results){
        if(err)
            deferred.reject({success : false, action: "getFoldersToCopy", error: err});
        else
            deferred.resolve(results);
    });

    function walk(dir, done) {
        var results = {};
        fs.readdir(dir, function(err, list) {
            if (err) return done(err);
            var pending = list.length;
            if (!pending) return done(null, results);
            list.forEach(function(file) {
                //If its an excluded folder or file, skip it.
                if(excludeFolders.indexOf(file) >= 0 || excludeFiles.indexOf(path.resolve(dir, file)) >= 0){
                    if (!--pending) done(null, results);
                    return;
                }

                file = path.resolve(dir, file);
                fs.stat(file, function(err, stat) {
                    if (stat && stat.isDirectory()) {
                        walk(file, function(err, res) {
                            results = Object.assign(results, res);
                            if (!--pending) done(err, results);
                        });
                    } else {
                        results[dir] = (results[dir]) ? results[dir] : [];
                        results[dir].push(file);
                        if (!--pending) done(null, results);
                    }
                });
            });
        });
    };

    return deferred.promise;
}



function copyDist(excludeFiles){
    logData("Start copyFiles", 1);
    var deferred = q.defer();
    getFoldersToCopy(excludeFiles).then(function(results){
        const fromDir = process.env.PACKGIT_SOURCE;
        const toDir = path.join(process.env.PACKGIT_SOURCE, process.env.PACKGIT_OUTPUT_FOLDER);

        var promises = [];
        for (var folder in results) {
            if (!results.hasOwnProperty(folder)) continue;



            for(var x =0; x < results[folder].length; x++) {
                var file = results[folder][x];
                promises.push(copyFile(file, file.replace(fromDir, toDir)));
            }

        }
        q.all(promises).then(function(results) {
            deferred.resolve(true);
        });
    });

    return deferred.promise;
}

function copyFile(fromFile, toFile){
    logData("Start copyFile- from:" + fromFile + " - to:" + toFile, 1);
    var deferred = q.defer();
    fs.readFile(fromFile, function(err, data){
        if(err){
            deferred.reject({error: error.message, stack: error.stack});
        } else {
            fs.ensureDirSync(path.dirname(toFile));
            fs.writeFile(toFile, data, function(err){
                if (err)
                    deferred.reject({error: err.message, stack: err.stack});
                else
                    deferred.resolve({ success: true });
            });
        }
    });
    return deferred.promise;
}

function checkEnvVariables(){
    logData("Validating and Defaulting ENV variables.", 1);
    process.env.PACKGIT_OUTPUT_LIBRARY   = (process.env.PACKGIT_OUTPUT_LIBRARY) ? process.env.PACKGIT_OUTPUT_LIBRARY : "azure.deps.js";
    process.env.PACKGIT_OUTPUT_FOLDER    = (process.env.PACKGIT_OUTPUT_FOLDER) ? process.env.PACKGIT_OUTPUT_FOLDER : "dist";
    process.env.PACKGIT_SKIPCOMMIT       = (process.env.PACKGIT_SKIPCOMMIT &&
        (process.env.PACKGIT_SKIPCOMMIT.trim() === 'true' || process.env.PACKGIT_SKIPCOMMIT.trim() === '1')) ? 1 : 0;
    process.env.PACKGIT_BRANCH           = (process.env.PACKGIT_BRANCH) ? process.env.PACKGIT_BRANCH : "build";

    try{
        var t = JSON.parse(process.env.PACKGIT_EXCLUDED_ITEMS);
        if(t.length < 1)
            throw new Error("Default Not Set");
    } catch(exception){
        logData("WARNING: PACKGIT_EXCLUDED_ITEMS is not set, or not set to an array. Values defaulted.", 0);
        logData('Enter a proper value in .packgit or as an ENV variable. e.g. [".git", ".deploy", ".idea", "node_modules", "dist", "package.json", ".deployment", ".gitignore", ".gitmodules", ".npmignore"]', 1);
        process.env.PACKGIT_EXCLUDED_ITEMS = '[".git", ".deploy", ".idea", "node_modules", "' + process.env.PACKGIT_OUTPUT_FOLDER + '", "package.json", ".deployment", ".gitignore", ".gitmodules", ".npmignore"]';
    }
    try{
        var t = JSON.parse(process.env.PACKGIT_IGNORED_MODULES);
        if(t.length < 1)
            throw new Error("Default Not Set");
    } catch(exception){
        logData("WARNING: PACKGIT_IGNORED_MODULES is not set, or not set to an array. Values defaulted.", 0);
        logData('Enter a proper value in .packgit or as an ENV variable. e.g. ["crypto", "openpgp"]', 0);
        process.env.PACKGIT_IGNORED_MODULES = '[]';
    }
}


/**
 * getFunctionFolders - Gets a list of all the folders that contain Azure Functions.
 * @returns Promise - [ folder1, folder2, folder3 ]
 */
function getFunctionFolders(a){
    logData("Start getFunctionFolders", 1);
    var deferred = q.defer();
    var topFolders = [];
    fs.readdir(process.env.PACKGIT_SOURCE, function(err,files){
        if(err){
            deferred.reject({success : false, error : err});
        } else {
            var exclude_files = JSON.parse(process.env.PACKGIT_EXCLUDED_ITEMS);
            for(var i=0; i<files.length; i++){
                var filePath = path.join(process.env.PACKGIT_SOURCE, files[i]);
                if( exclude_files.indexOf(files[i]) < 0 && fs.statSync(filePath).isDirectory()) {
                    try{
                        //Will error and hit catch if file doesn't exist.
                        fs.statSync(path.join(filePath, "function.json"));
                        topFolders.push(files[i]);
                    } catch(e){}//Just to see if file exists
                }
            }
            logData("getFunctionFolders Results:" + JSON.stringify(topFolders), 6);
            deferred.resolve({success : true, top_folders : topFolders });
        }
    });
    return deferred.promise;
}

function catalogDependencyFiles(folder){
    logData("Start catalogDependencyFiles:" + folder, 1);
    const deferred = q.defer();
    const base = process.env.PACKGIT_SOURCE;
    const index = path.join(base, folder, "index.js");

    fs.readFile(index, 'utf8', function (err,data) {
        if (err && err.code == 'ENOENT')
            deferred.reject({success : true, error : err });
        else if (err)
            deferred.reject({success : false, error : err });

        getPaths(index, data).then(resolvePaths).then(updateIndex).then(function(results){
            deferred.resolve({success:true, results : results});
        }).done(function(){}, function(error){
            deferred.reject({success: false, "action":"createDependencyDone", "error": error });
        });
    });

    return deferred.promise;
}


//*********************** HELPER FUNCTIONS ***************************

/**
 * getPaths - Give a file name, extracts all requires with path.join's that include variables.
 * @param file - The name of the file to search
 * @returns {*|promise|h|} - Object { FILE_PATTERN : {find : REQUIRE_STATEMENT, files: []}}
 */
function getPaths(file, data){
    logData("Start getPaths", 1);
    var deferred = q.defer();
    var paths = {};
    const replace = {
        "__dirname" : "'" + path.dirname(file) + "'"
    };

    //Extract the normal requires without wildcards.
    var regex = /require\s*\(['"]([^'"]+)['"]\)/g;
    var match = regex.exec(data);

    //Grab/Store all standard libraries to remove duplicates
    while (match !== null) {
        var requireName = (match[1].search(/^[\.]+[\\\/]/) < 0) ? path.normalize(match[1]) : path.normalize(path.join(path.dirname(file), match[1]));
        paths[requireName] = {}
        paths[requireName].find =match[0];
        paths[requireName].files = [match[1]];
        paths[requireName].replace = "'" + requireName.replace(path.normalize(process.env.PACKGIT_SOURCE) + path.sep,'') + "'";
        match = regex.exec(data);
    }

    //Extract the WildCard requires
    var regexPathRequire = /require\s*\(\s*\(*\s*path\.join\s*\(([^\)]+)\)\s*\)*\s*\)/g
    var matchPathRequire = regexPathRequire.exec(data);

    while (matchPathRequire !== null) {
        var wildCardName = matchPathRequire[1].split(",").map(function (value) {
            //Make replacements for known variables
            var updated = (replace[value]) ? value.replace(value, replace[value]).trim() : value.trim();

            var varReplaced = updated.split("+").map(function (section) {
                if (/^'.+'$/.test(section.trim())) //If surrounded by ', its a String so return value with ' trimmed
                    return section.trim().replace(/^'/, '').replace(/'$/, '');
                if (/^".+"$/.test(section.trim())) //If surrounded by ", its a String so return value with " trimmed
                    return section.trim().replace(/^"/, '').replace(/"$/, '');
                //If not, its a var, so return a wildcard.
                return "*";
            }).join('');

            return varReplaced;
        }).join(path.sep);
        wildCardName = path.normalize(wildCardName);
        paths[wildCardName] = {};
        paths[wildCardName].find = matchPathRequire[0];
        paths[wildCardName].replace = "'" + wildCardName.replace(path.normalize(process.env.PACKGIT_SOURCE) + path.sep, '') + "'";

        //Handle when variable names are in the URL's
        var findString = new RegExp("(^|(,\\s*))([a-zA-Z]+[^'\",]*)");//Finds variable section of match
        var tMat = findString.exec(matchPathRequire[1]);
        while (paths[wildCardName].replace.includes("*") && tMat !== null){
            paths[wildCardName].replace = paths[wildCardName].replace.replace("*", "' + " + tMat[3] + " + '");
            tMat = findString.exec(matchPathRequire[1]);
        }
        //Cleanup Extra +'s since we don't know what side the + was on before.
        paths[wildCardName].replace = paths[wildCardName].replace.replace(/\s*\+\s*\+\s*/g, " + ");

        matchPathRequire = regexPathRequire.exec(data);
    }
    deferred.resolve({success: true, index: file, paths :paths });

    return deferred.promise;
}

function reduceStrings(acc, curr, index, array){
    logData("Start reduceStrings", 1);
    var qRegex = /'[^']+'/;
    var dqRegex = /"[^"]+"/;
    var begRegex = /^['"]/;
    var endRegex = /['"]$/;
    var sep = acc[0];
    var retVal = '';
    //If both the accumulated & Current value are strings, concat them
    if(qRegex.test(acc) && endRegex.test(acc) && begRegex.test(curr) &&  (qRegex.test(curr) || dqRegex.test(curr))   ) {
        retVal = acc.replace(begRegex, "'").replace(endRegex, '') + sep + curr.replace(begRegex, '').replace(endRegex, "'");
    } else if (endRegex.test(acc)){//If acc is a string, need the sep to be within the quotes, not after.
        var tempSep = (sep === '+') ? "'" + sep : sep + "' + ";//If next item starts with a non-string, we need a + if this is a / call
        retVal = acc.replace(endRegex, tempSep) + curr.replace(/"/g, "'");
    } else {
        retVal = acc + sep + curr;
    }
    retVal = (index + 1 === array.length) ? retVal.slice(2) : retVal;
    return retVal;
}

/**
 * resolvePaths - Takes a list of wildcard patterns and gets files that match that patterns.
 * @param wildCardPaths - Object of the format that getPaths returns e.g.  - Object { FILE_PATTERN : {find : REQUIRE_STATEMENT, files: []}}
 * @returns {*|promise|h} - Object { FILE_PATTERN : {find : REQUIRE_STATEMENT, files: [FILE_MATCH1, FILE_MATCH2]}} with files filled out
 */
function resolvePaths(pathResults){
    logData("Start resolvePaths", 1);
    var deferred = q.defer();
    var promises = [];
    var paths = pathResults.paths;
    for (var filePath in paths) {
        if (!paths.hasOwnProperty(filePath)) continue;

        //If it doesn't have a / or \ its a node_module and should not go through this process
        if(filePath.search(/[\\\/]/) < 0)
            continue;

        var normalPath = path.normalize(filePath);

        var baseDir ="",
            basePath = "";

        //If its something that references a file-path, do something else.
        if (normalPath.indexOf("*") < 0){
            baseDir = path.dirname(normalPath);
            basePath = path.basename(normalPath);
        } else {
            basePath = normalPath.substr(0, normalPath.indexOf("*"));
            baseDir = basePath.substr(0, basePath.lastIndexOf(path.sep));
        }
        promises[promises.length] = paths[filePath].filePromise = getFiles(baseDir, normalPath);
    }
    q.allSettled(promises).then(function(results){
        for (var filePath in paths) {
            if (!paths.hasOwnProperty(filePath)) continue;
            if(paths[filePath].filePromise && paths[filePath].filePromise.inspect().state == "fulfilled") {//Since nonWildCard hasn't set this
                paths[filePath].files = paths[filePath].filePromise.valueOf();
                delete paths[filePath].filePromise;
            }
        }
        deferred.resolve({success: true, action: "resolvePaths", index: pathResults.index, paths: paths });
    }).catch(function(error){
        deferred.reject({ success : false, action: "resolvePaths", error: error });
    });
    return deferred.promise;
}

/**
 * getFiles - Searches the given base directory for items that match the filePattern.
 * @param baseDir - The base directory to search e.g. c:\dev\src
 * @param filePattern - A file pattern with * for wildcards
 * @returns {*|promise|h} - Array of File matches on resolve [FILE_ONE, FILE_TWO], detailed error object on reject
 */
function getFiles(baseDir, filePattern){
    logData("Start getFiles", 1);
    const deferred = q.defer();

    //If there are no wildcards in the filePattern then check-exist & resolve to values
    if(filePattern.indexOf("*") < 0) {
        fs.stat(filePattern, function (err, stats) {
            //If an error and has a file extension, resolve with no files.
            if (err && path.extname(filePattern) !== '')
                deferred.resolve([]);
            else if (err) { //Otherwise, if just error, retry with ".js".
                fs.stat(filePattern + ".js", function (error, stats) {
                    deferred.resolve((error) ? [] : filePattern + ".js");
                });
            } else {//Otherwise if not an error, resolve to files
                if (stats.isDirectory()) {//If directory, we really want index.js
                    fs.stat(path.join(filePattern, "index.js"), function (error, stats) {
                        deferred.resolve((error) ? [] : [path.join(filePattern, "index.js")]);
                    });
                } else //Not a directory, so this is a valid value and can be returned
                    deferred.resolve([filePattern]);
            }
        });
    } else { //If wild-cards, follow the file path to resolve.
        walk(baseDir, filePattern, function(err, files){
            if(err)
                deferred.reject({success: false, action: "getFiles", dir : baseDir, pattern: filePattern, files: files, error : err });
            else{
                deferred.resolve(files);
            }
        });
    }

    function walk(dir, fileFilter, done) {
        var results = [];
        fs.readdir(dir, function(err, list) {
            if (err) return done(err);
            var pending = list.length;
            if (!pending) return done(null, results);
            list.forEach(function(file) {
                file = path.resolve(dir, file);
                fs.stat(file, function(err, stat) {
                    if (stat && stat.isDirectory()) {
                        if(matchesFilePattern(file, fileFilter, true))
                            walk(file, fileFilter, function(err, res) {
                                results = results.concat(res);
                                if (!--pending) done(null, results);
                            });
                        else
                        if (!--pending) done(null, results);
                    } else {
                        if(matchesFilePattern(file, fileFilter, false))
                            results.push(file);
                        if (!--pending) done(null, results);
                    }
                });
            });
        });
    };
    return deferred.promise;
}

/**
 * matchesFilePattern - Helper function for getFiles that tests to see if a given file matches the described pattern
 * @param file - The file to see if it matches.
 * @param pattern - The pattern to match
 * @param isDir - Is it a directory? If so then a subdir of a valid path is also valid (so getFiles will recures properly)
 * @returns {boolean} - True if it matches the file pattern, false if it does not.
 */
function matchesFilePattern(file, pattern, isDir){
    logData("Start matchesFilePattern", 1);
    var patterns = pattern.split("*");
    var toMatch = file;
    for(var i=0; i<patterns.length; i++){
        switch(i){
            case (patterns.length - 1):
                //If the pattern matches return true, or if there are no more slashes then the wildcard would have covered i
                if(toMatch.endsWith(patterns[i]) || ((toMatch.match(new RegExp("\\" + path.sep, "g")) || []).length < 2))
                    return true;
                else
                    return false;
            case 0:
                if(!toMatch.startsWith(patterns[i]))
                    return false;
                toMatch = toMatch.replace(patterns[i],'');
                break;
            default:
                var index = toMatch.indexOf(patterns[i]);
                //If its a file, it needs to match 100%
                if( index < 0 && !isDir)
                    return false;
                if( index < 0 && isDir){//If its a dir, this could still be a match
                    //Find the last slash and take before that as a pattern
                    var p = patterns[i].substr(0,patterns[i].lastIndexOf(path.sep));
                    if(p === "")//If there isn't a slash, & a dir, this would be covered by last wildcard.
                        return true;
                    var m = toMatch.indexOf(p);
                    if(m < 0) //If there is no match to this pattern, its definitely false
                        return false;
                    //If there is a match, and when you find the index of that match there is nothing left toMatch
                    //Then this dir is still potentially in scope.
                    if(m >= 0 && toMatch.substr(m + p.length).trim().length < 1)
                        return true
                    else //If not, return false
                        return false;
                }
                if(index >= 0){
                    toMatch = toMatch.substr(index + patterns[i].length);
                }
        }
    }
}

/**
 * createDependencyFileJS  - Takes the wildCardPaths output from resolvePaths and generates the JavaScript to include/reference files
 * @param wildCardPaths - Output format from resolvePaths - e.g. Object { FILE_PATTERN : {find : REQUIRE_STATEMENT, files: [FILE_MATCH1, FILE_MATCH2]}}
 * @returns {*|promise|h} - String - The JavaScript to create the includes.
 */
function createDependencyFileJS(allResults){
    logData("start CreateDependencyFileJS", 1);
    var requires = "\tglobal.azureDeps = (global.azureDeps) ? global.azureDeps : {};\n";
    var indexes = [];
    var alreadySet = {};
    for(var a=0; a < allResults.length; a++){
        var promise = allResults[a];
        if(!promise.value && promise.value.success)//If individual item rejected, but it was a success, just skip
            continue;

        indexes.push(promise.value.results.index);
        var paths = promise.value.results.paths;

        var targetFiles = Object.keys(paths);
        //Cycles Through the identified function index.js files.
        for(var x=0; x<targetFiles.length; x++){
            var files = paths[targetFiles[x]].files;

            //Cycles Through Each Defined require in the file.
            for(var y=0; y<files.length; y++){
                var file = files[y];
                if(!alreadySet[file]) {
                    //Normalize the FileName to remove base folder, so same file referenced from multiple places is included once.
                    var replaceValue = file.replace(path.normalize(process.env.PACKGIT_SOURCE) + path.sep,'');

                    requires += '\tglobal.azureDeps["' + replaceValue.replace(/[\\]/g, '\\$&') +
                        '"] =\trequire("' + file.replace(/[\\]/g, '\\$&') + '");\n';
                    logData("Requires1:" + requires, 9);
                    if (path.extname(replaceValue).toLowerCase() === '.js') {//Add aliases for other common ways referenced
                        if(path.basename(replaceValue, '.js') === 'index') {//If index, also reference just by the dirname
                            requires += '\tglobal.azureDeps["' + path.dirname(replaceValue).replace(/[\\]/g, '\\$&') +
                                '"] =\t global.azureDeps["' + replaceValue.replace(/[\\]/g, '\\$&') + '"];\n';
                            logData("Requires2:" + requires, 9);
                        } else {//If non-index, also reference by the dir + basename without the .js extension
                            requires += '\tglobal.azureDeps["' + path.join(path.dirname(replaceValue), path.basename(replaceValue, '.js')).replace(/[\\]/g, '\\$&') +
                                '"] =\t global.azureDeps["' + replaceValue.replace(/[\\]/g, '\\$&') + '"];\n';
                            logData("Requires3:" + requires, 9);
                        }
                    }
                    alreadySet[file] = true;
                }
            }
        }
    }

    return q({success : true, action: "createDependencyFileJS", js : requires, indexes: indexes });
}

function createDependencyFile(results){
    logData("Start createDependencyFile", 1);
    var deferred = q.defer();
    var depFile = path.join(process.env.PACKGIT_SOURCE, process.env.PACKGIT_OUTPUT_LIBRARY);

    fs.writeFile(depFile, results.js, function(err) {
        if (err)
            deferred.reject({success: false, action: "Write Dep File", file: depFile, error: err});
        else
            deferred.resolve({success : true, indexes: results.indexes });
    });
    return deferred.promise;
}

/**
 * updateIndex - Updates the copied index to point to the appropriate requeried files.
 * @param folder - The folder to get the index from
 * @returns {*|promise|h|*|promise|h} - Resolve on Success Reject on Failure
 */
function updateIndex(pathResults){
    logData("Start updateIndex", 1);
    const deferred = q.defer();
    const index = pathResults.index;
    const newIndex = pathResults.index.split(path.sep).slice(0,-2).concat([process.env.PACKGIT_OUTPUT_FOLDER], pathResults.index.split(path.sep).slice(-2)).join(path.sep);
    const depFile = path.join(path.dirname(pathResults.index), process.env.PACKGIT_OUTPUT_LIBRARY);

    //Read tye copied index file and start creating the new file.
    fs.readFile(index, 'utf8', function (err,data) {
        if (err)
            deferred.reject({success : false, error : err });

        //Update data to reference the new dependency structure
        for (var filePath in pathResults.paths) {
            if (!pathResults.paths.hasOwnProperty(filePath)) continue;
            var pathObj = pathResults.paths[filePath];
            //Escape the string, and then substitute regExPattern for ' or " to allow either to surround string
            var sReg = pathObj.find.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&').replace(/['"]/g,"['\"]");
            data = data.replace(new RegExp(sReg, "g"), "global.azureDeps[" + pathObj.replace.replace(/[\\]/g, '\\$&') + "]");

        }

        //Add Require Dependency to top of the file.
        var useStrictRegex = /^\s*['"]use strict['"];/g;
        var useStrict = "'use strict';\n";
        var requireFile = "require('" + path.join('..', process.env.PACKGIT_OUTPUT_LIBRARY).replace(/[\\]/g, '\\$&') + "');\n";
        data = (useStrictRegex.test(data)) ? data.replace(useStrictRegex, useStrict + requireFile) : requireFile + data;

        //Write the new index file with the contents
        fs.ensureDir(path.dirname(newIndex), function(err){
            if (err)
                deferred.reject({success : false, "action": "UpdateIndex-ensureDir", "index" : newIndex, error : err });
            fs.writeFile(newIndex, data, function(error){
                if (error)
                    deferred.reject({success : false, "action": "UpdateIndex-writeIndex", "index" : newIndex, error : error });
                deferred.resolve({success : true, index: pathResults.index, paths: pathResults.paths, newIndex: newIndex });
            });
        });

    });
    return deferred.promise;
}


/**
 * gitAddCommit - Adds all files that changed that are in the dist folder, commits, and pushes these changes.
 * @returns {*|promise|h} - Resolves to success : true on success, or rejects to success : false. Also contains output of commands.
 */
function gitAddCommit(dirDetails){
    logData("Start gitAddCommit", 1);
    var deferred = q.defer();
    //Skip if PACKGIT_SKIPCOMMIT is set
    if (parseInt(process.env.PACKGIT_SKIPCOMMIT) > 0){
        logData('Commit skipped, per value of ENV PACKGIT_SKIPCOMMIT', 0);
        return q(true);
    }

    var commands = ['git add .', 'git commit --message="Build:' + new Date().toISOString() + '"', 'git push'];
    var settings = {cwd: path.join(process.env.PACKGIT_SOURCE, process.env.PACKGIT_OUTPUT_FOLDER) };

    execCommands(commands, settings).then(function(success){
        deferred.resolve(true);
    }, function(failed){
        var error = failed.error;
        if(failed.stdout.includes("Your branch is up-to-date with '")){
            deferred.reject(new Error("No changes to commit! Origin is up-to-date."));
        } else if(error.message && error.message.indexOf("The current branch "+ process.env.PACKGIT_BRANCH +" has no upstream branch.") >= 0){
            execCommand('git push --set-upstream origin ' + process.env.PACKGIT_BRANCH, settings).then(function(){
                deferred.resolve(true);
            }, function(failure){
                deferred.reject(failure);
            });
        } else
            deferred.reject(failed);
    });

    return deferred.promise;
}

function logData(data, level){
    "use strict";
    var logLevel = (parseInt(process.env.PACKGIT_DEBUG_LEVEL)) ? parseInt(process.env.PACKGIT_DEBUG_LEVEL) : 0;

    if(logLevel >= level){
        console.log(data);
    }

}

function logError(error, prefix){
    var itemPrefex = (prefix)? prefix + ": " : "";
    if(error.message)
        logData(itemPrefix + error.message, 0);
    if(error.stack)
        logData(itemPrefix + error.stack, 0);
}