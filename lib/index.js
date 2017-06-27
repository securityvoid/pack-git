'use strict';
const webpack = require("webpack");
const fs = require('fs-extra');
const path = require('path');
const q = require("q");
const exec = require('child_process').exec;

module.exports.master_pack_it = function(dir, dist, exclude){
    return prepareDistFolder(dir, dist, exclude).then(copyFiles).then(webPackIt).then(gitAddCommit);
}

/**
 * prepareDistFolder - Removes the prior dist folder, recreates it, copies over the .git directory, and sets the branch to "master" before
 * the other operations run, so that everything is ready to go.
 * @returns {*|promise|h} - Resolves to success : "true" with the output of the git command on success, rejects to success : false.
 */
function prepareDistFolder(cwd, dist, exclude){
    var deferred = q.defer();
    var dist = path.join(cwd, dist);
    fs.removeSync(dist);
    fs.ensureDir(dist, function (err) {
        if(err){
            deferred.reject({success : false, error : err});
        } else {
            fs.copy(path.join(cwd, ".git"), path.join(dist, ".git"), function (err) {
                if (err)
                    deferred.reject({success : false, error : err});
                else {
                    exec('git stash', {cwd: path.join(cwd, "dist")}, function(error, stdout, stderr) {
                        if (error) {
                            deferred.reject({success: false, error: error, stdout: stdout, stderr: stderr})
                        } else {
                            exec('git checkout master', {cwd: path.join(cwd, "dist")}, function (error1, stdout1, stderr1) {
                                if (error) {
                                    deferred.reject({success: false, error: error1, stdout: stdout1, stderr: stderr1})
                                } else {
                                    exec('git pull', {cwd: path.join(cwd, "dist")}, function (error2, stdout2, stderr2) {
                                        if (error2) {
                                            deferred.reject({success: false, error: error2, stdout: stdout2, stderr: stderr2})
                                        } else {
                                            deferred.resolve({success: true, error: error2, stdout: stdout2, stderr: stderr2, cwd: cwd, dist: dist, exclude: exclude})
                                        }
                                    });
                                }
                            });
                        }
                    });
                }
            })
        }
    })
    return deferred.promise;
}

/**
 * copyFiles - Copies all the files besides ".git" needed for the Master branch into the "dist" folder.
 * @returns {*|promise|h} - Resolves on success with a payload of {success : true}, rejects on failure with {success: false, error : error}
 */
function copyFiles(dirDetails){
    var deferred = q.defer();
    var dist = path.join(dirDetails.cwd, dirDetails.dist);
    fs.ensureDir(dist, function (err) {
        if(err){
            deferred.reject({success : false, error : err});
        } else {
            fs.copy(dirDetails.cwd, dist, function(file){
                for(var i = 0; i < dirDetails.exclude.length; i++){
                    var targetFile = path.normalize(file);
                    var filter = path.join(dirDetails.cwd, dirDetails.exclude[i]);
                    if(targetFile.startsWith(filter)){
                        return false;
                    }

                }
                return true;
            }, function (err) {
                if (err)
                    deferred.reject({success : false, error : err});
                else {
                    deferred.resolve({success : true, cwd: dirDetails.cwd, dist: dirDetails.dist });
                }
            })
        }
    })
    return deferred.promise;
}

/**
 * webPackIt - Takes the main deploy.js, pulls in all dependencies to one file, and uglifies it for faster operation.
 * @returns {*|promise|h} - Promise returns {success : true} if everything runs properly, or rejects on failure with the error in {error : error}
 */
function webPackIt(fileDetails){
    var deferred = q.defer();

    var compiler = webpack({
        entry: path.join(fileDetails.cwd, "lib", "index.js"),
        target: 'node',
        output : {
            path : path.join(fileDetails.cwd, fileDetails.dist),
            filename : "lib.js",
            library: "index",
            libraryTarget: "commonjs2"
        },
        node: {
            __filename: false,
            __dirname: false,
        },
        plugins: [
            new webpack.optimize.UglifyJsPlugin({
                compress: {
                    warnings: false,
                },
                output: {
                    comments: false,
                }
            })
        ],
        module: {
            loaders: [{
                test: /\.json$/,
                loader: 'json-loader'
            }]
        }
    }, function(err, stats) {
        if(err)
            deferred.reject({success: false, error : err});
        var jsonStats = stats.toJson();
        if(jsonStats.errors.length > 0)
            deferred.reject({success: false, error : jsonStats.errors});
        if(jsonStats.warnings.length > 0)
            deferred.resolve({success : true, warnings : jsonStats.warnings, cwd: fileDetails.cwd, dist: fileDetails.dist });
        deferred.resolve({success : true, cwd: fileDetails.cwd, dist: fileDetails.dist});
    });

    return deferred.promise;
}


/**
 * gitAddCommit - Adds all files that changed from the master that are in the dist folder, commits, and pushes these changes.
 * @returns {*|promise|h} - Resolves to success : true on success, or rejects to success : false. Also contains output of commands.
 */
function gitAddCommit(dirDetails){
    var deferred = q.defer();
    exec('git add .', {cwd: path.join(dirDetails.cwd, dirDetails.dist)}, function(error, stdout, stderr){
        if (error) {
            deferred.reject({success : false, error : error, stdout: stdout, stderr : stderr })
        } else {
            exec('git commit --message="Build Master:' + new Date().toISOString() + '"',
                {cwd: path.join(dirDetails.cwd, dirDetails.dist)}, function(error2, stdout2, stderr2){
                    if (error2) {
                        deferred.reject({success : false, error : error2, stdout: stdout2, stderr : stderr2 })
                    } else {
                        exec('git push', {cwd: path.join(dirDetails.cwd, dirDetails.dist)}, function(error3, stdout3, stderr3){
                            if (error3) {
                                deferred.reject({success : false, error : error3, stdout: stdout3, stderr : stderr3 })
                            } else {
                                deferred.resolve({success : true, error : error3, stdout: stdout3, stderr : stderr3 })
                            }
                        });
                    }
                });
        }
    });
    return deferred.promise;
}