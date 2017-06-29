#!/usr/bin/env node
const lib   = require('../lib/');
const path  = require('path');

var argv = require('minimist')(process.argv.slice(2));

if(argv['target'])
    process.env.PACKGIT_SOURCE=argv['target'];

if(!process.env.PACKGIT_SOURCE) {
    console.log("ENV variable DEPLOYMENT_SOURCE must be set or a value passed for --target")
    process.exit(1)
}

process.env.PACKGIT_SOURCE=path.resolve(process.env.PACKGIT_SOURCE);

var fs = require('fs');
if (!fs.existsSync(process.env.PACKGIT_SOURCE)) {
    console.log("Target folder set with ENV DEPLOYMENT_SOURCE or --target does not exist");
    process.exit(1);
}
lib.createDistribution().then(function(success){
    console.log('Distribution Created!');
}, function(error){
    console.log('Distribution Failed!');
    if(error instanceof Error) {
        console.log(error.message);
        console.log(error.stack);
    } else if (error.error instanceof Error) {
        console.log(error.error.message);
        console.log(error.error.stack);
    } else
        console.log(JSON.stringify(error));

});

