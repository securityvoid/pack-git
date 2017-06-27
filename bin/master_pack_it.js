#!/usr/bin/env node
var fs = require('fs');
const lib = require('../lib/');
var argv = require('minimist')(process.argv.slice(2));
console.log(JSON.stringify(argv));

    if(!argv['target'] || !argv['target'].length)
        errorOut('ERROR: target for master-pack is not optional.');

    var target = argv['target'];
    if (!fs.existsSync(target))
        errorOut('ERROR: target for master-pack does not exist.');

    var dist = 'dist';
    if(typeof argv['dist']==='string')
        dist = argv['dist'];

    var exclude = [dist, '.idea', 'node_modules', '.git'];
    if(argv['exclude']){
        try {
            var tmpExclude = JSON.parse(argv['exclude'].replace(/'/g, '"'));
            if(!Array.isArray(tmpExclude))
                errorOut('ERROR: exclude for master-pack is not an array.')
            exclude = tmpExclude;
        } catch(e){
            console.log(e.message);
            errorOut('ERROR: exclude for master-pack does not parse as an array.');
        }
    }

    lib.master_pack_it(target, dist, exclude).then(function(success){
        console.log('WebPacked to the master branch!')
    }, function(failure){
        console.log('EEP! An error occured!');
        throw failure.error;
    });


function errorOut(message){
    console.log(message);
    console.log("Usage:");
    console.log("\tmaster-pack --target=. --dist=dist --exclude=['fold1','fold2','file']");
    console.log('\t\t--target\t- Required - The target directory to Webpack');
    console.log('\t\t--dist\t\t- Optional - The name of the directory to put the distribution within');
    console.log('\t\t--exclude\t- Optional - An array of directories and files to exclude in the copy.')
    process.exit(1);
}



//process.cwd, "dist", ['dist', "node_modules", ".idea", ".git"];
