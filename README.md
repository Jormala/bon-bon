# Bon-Bon software

This repo contains all the code to use and contol Bon-Bon accordingly.

## Setup

### Prerequisites

- [Node.js v18.13.0+](https://nodejs.org/en)
  - *Developed mostly on `v18.13.0`*
- npm *(should installed come with node.js)*
- Some cool ass [code editor](https://notepad-plus-plus.org/) for debugging when the shit hits the fan.

### Server

*The "brain" of the project.*

Go to the `server` -directory and run `npm install`. This will install the required packages for the server to function. *You only have to do this once.*

After this everytime you want to start the server, run `node server.js` in this folder.

The server will not do anything if:
1. It cannot find a node-red instance in the local network. *(check [here]() if you have problems finding your Raspberry Pi)*
1. A [client](#client) isn't running.

*You should keep an eye out for the console even though the client exists, as most of the errors aren't forwarded back to the client*


### Client

*The user interface of the project.*

Start the `client/index.html` -page. 
  - *It's normal for the console to start bitching about how it: `Failed to connect to ws://localhost:3000/.`*

The client should try to connect to any server currently being hosted on your computer. If it loses connection to server, it will try to reconnect. 

***Check the console for any errors if it doesn't seem to connect to a server after ~10 seconds AND the server is running and is also trying to establish a connection***

*Make sure you have no other things running on port 3000, as it's used for communication between the server and the client.*

### Raspberry Pi

TODO


## Troubleshooting

### "I cannot `npm install`"

I have no idea what can cause this. *Make sure you have `npm` and `node` installed?*


### *"I cannot locate my Raspberry Pi"*

*I assume that you've tried to launch the program and it starts yelling at you right away and/or exits.*

**TLDR; Find the Raspberry Pi's IP in your local network.**:w

LR; The easiest solution for this is to launch the Rasperry Pi, and look what IP is given to it from there. (or using some other *fancy* way). Either way, ***finding the Rasperry Pi's IP is the most pain in the ass in this whole process.***

Once you have it, set the `RASPBERRY_PI` value in `server/options.json` to IP you just found.

**It still doesn't work**

*You may be **very** fucked, but here are some things you can still try:*
1. Check if you and the Rasperry Pi are connected on the same network.
1. Check if the node-red server is running on the right port (usually 1880). On the server side the port should be printed everytime the server is ran to the console.
1. Check if your firewall or the Rasperry Pi's firewall are blocking any requests to port 1880 or from 1880, but this really shouldn't be the case.
1. *You can also check the source code if I've fucked up and chaged port. \:,)*


## Architecture

*lmao this diagram is already outdated*
**Here's a nice diagram:** 

![](https://github.com/Jormala/bon-bon/assets/82582260/d5e6e397-b91e-43ef-b990-560abf31cdeb)

TODO

<!-- Here's the basic architecture of the project for the interested. -->

