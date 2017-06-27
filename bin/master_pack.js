#!/usr/bin/env node
const lib   = require('../lib/');
const path  = require('path');

var argv = require('minimist')(process.argv.slice(2));

if(argv['target'])
    process.env.DEPLOYMENT_SOURCE=argv['target'];

if(!process.env.DEPLOYMENT_SOURCE) {
    console.log("ENV variable DEPLOYMENT_SOURCE must be set or a value passed for --target")
    process.exit(1)
}

process.env.DEPLOYMENT_SOURCE=path.resolve(process.env.DEPLOYMENT_SOURCE);

var fs = require('fs');
if (!fs.existsSync(process.env.DEPLOYMENT_SOURCE)) {
    console.log("Target folder set with ENV DEPLOYMENT_SOURCE or --target does not exist");
    process.exit(1);
}
lib.createDistribution();

