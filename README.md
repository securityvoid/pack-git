# pack-git

Package for simplifying the Webpacking of Azure Functions, and returning the Webpacked version to a specific git branch.

This very well may work on other things with some slight tweaks, but its designed specifically to help resolve the [cold start issues with Azure Functions](https://github.com/Azure/azure-webjobs-sdk-script/issues/298).

Since we use continuous deployment from source-control, we needed a quick/easy way to have a webpacked version in that source-control to bypass the cold-start issues.

We originally started with [a .deploy script](https://github.com/securityvoid/.deploy) to do the webpacking, but 5-10 minutes for a deploy REALLY slows down development. That script was modified/morphed into this solution.

After we had just about finished the .deploy script, Microsoft came out with their own solution [Azure Functions Pack](https://github.com/Azure/azure-functions-pack).

That is likely a more robust solution, but didn't do anything with Git.
