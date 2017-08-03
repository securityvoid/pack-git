# pack-git

Package for simplifying the Webpacking of Azure Functions, and returning the Webpacked version to a specific git branch.

This very well may work on other things with some slight tweaks, but its designed specifically to help resolve the [cold start issues with Azure Functions](https://github.com/Azure/azure-webjobs-sdk-script/issues/298).

Since we use continuous deployment from source-control, we needed a quick/easy way to have a webpacked version in that source-control to bypass the cold-start issues.

We originally started with [a .deploy script](https://github.com/securityvoid/.deploy) to do the webpacking, but 5-10 minutes for a deploy REALLY slows down development. That script was modified/morphed into this solution.

After we had just about finished the .deploy script, Microsoft came out with their own solution [Azure Functions Pack](https://github.com/Azure/azure-functions-pack).

That is likely a more robust solution, but didn't do anything with Git.


## Configuration
When calling pack-git at a bare minimum you need to pass --target to specify the folder you'd like it to run within, or set the environmental variable PACKGIT_SOURCE to the location. You also have the option of passing the git branch in as similar manner by using the --branch flag. These two flags are created in order to allow you to setup npm scripts that pack up the source to the specified branch. 

For example, with Pack-Git's typical usage you would install this project as a dev dependency.

e.g.
```npm install --save-dev git+https://github.com/securityvoid/pack-git.git```

And then within your package.json you would include a scripts section something like the following:
```
"scripts": {
    "build": "node node_modules/pack-git/bin/pack_git.js --target=.",
    "devbuild": "node node_modules/pack-git/bin/pack_git.js --target=. --branch=devbuild",
  }
``` 

Additional options can be then configured within a file .packgit in the root of the folder where your target points.

### Command Line Options

**--target** - The target folder which should be WebPacked and sent to GIT. This is required to be set as a command line option, or as the environmental variable PACKGIT_SOURCE.  

**--branch** - The branch to commit changes to when pack-git runs. This can also be set by either a .packgit configuration file entry, or an environmental variable set with the name PACKGIT_BRANCH.

### PackGit Configuration
All configuration items listed below can be set either as environmental variables or as items within a the configuration file .packgit . Environmental variables will override configuration file items if there are configuration items by the same name.

Example Configuration File, set with all the defaults:
```PACKGIT_BRANCH=build
PACKGIT_SKIPCOMMIT=false
PACKGIT_OUTPUT_LIBRARY=azure.deps.js
PACKGIT_OUTPUT_FOLDER=dist
PACKGIT_IGNORED_MODULES=["crypto", "openpgp"]
PACKGIT_EXCLUDED_ITEMS=[".git", ".idea", "node_modules", "dist", "package.json", ".gitignore", ".gitmodules", ".npmignore", ".PACKGIT", ".funcpack", "funcpack.config.json"]
```

#### Configuration File Options:
**PACKGIT_BRANCH** - The branch in the repository where you want the packed files to go. If it does not exist, it will create it.
 
**PACKGIT_SKIPCOMMIT** - If set to "true" or 1, it will pack everything into the designated folder, but will not commit those results to the git repository.

**PACKGIT_OUTPUT_LIBRARY** - The name of the library file that everything should be combined into.

**PACKGIT_IGNORED_MODULES** - A list of any modules that should be ignored by WebPack and not combined.

**PACKGIT_EXCLUDED_ITEMS** - A list of files or folders that should not be copied into the folder used to create the distribution. This is mostly useful for getting rid of artifacts that are not needed for the application to run, but are in the main git branches.
