# warp-fwd-dns
This is a Cloudflare Worker that functions as Logpush endpoint and updates a Cloudflare DNS zone with your hostnames and CGNAT IPs of your WARP connected users.

It utilizes Variables and Secrets in the Worker setting for the following:

ACCOUNT_ID - your Cloudflare Account ID

API_KEY - your Global API Key

EMAIL - email used for your Global API Key

ZONE_ID - the Zone ID for your domain

DOMAIN_SUFFIX - the corresponding name of your ZONE_ID

## Logpush Configuration:
When you set up your Logpush job, the destination is the URL of this worker that you create.
The Logpush job will be for the Gateway HTTP dataset.  
You only need to send DeviceID and DeviceName.
And you only need to send if URL = "https://_YourTeamNameGoesHere_.cloudflareaccess.com/warp" OR if the HTTPHost is "connectivity.cloudflareclient.com"
