# Bon-Bon software

This repo contains all the code to use and contol Bon-Bon accordingly.

## Setup

### Prerequisites

- [Node.js v18.13.0+](https://nodejs.org/en)
  - *Developed mostly on `v18.13.0` and `v20.9.0`*
- npm *(should come installed with node.js)*
- Some cool ass [code editor](https://notepad-plus-plus.org/) for debugging when the shit hits the fan.

### Server

*The "brain" of the project.*

Go to the `server` -directory and run `npm install` *(or `npm ci` [idk](https://stackoverflow.com/a/53325242))*. This will install the required packages for the server to function, and also should build the typescript files. *You only have to do this step once.*

After this everytime you want to start the server, run `npm start` *in this the `server` folder*
- *If you want to modify the typescript files and then run them, use the `npm run build-start` command instead.*

**The server will not do anything if:**
1. It cannot find a node-red instance in the local network.
1. A [client](#client) isn't running on the machine.

*You should keep an eye out for the console even though the client exists, as most of the errors aren't forwarded to the client*


### Client

*The user interface of the project.*

Start the `client/index.html` -page. 
  - *It's normal for the console to start bitching about how it: `Failed to connect to ws://localhost:3000/.`*

The client should try to connect to any server currently being hosted on your computer. If it loses connection to server, it will try to reconnect. 

*Make sure you have no other things running on port 3000, as it's used for communication between the server and the client.*

### Raspberry Pi

TODO


## Fun stuff

### Writing animations

*Animations are written to `server/res/animations.json`*

An `animation` has the following properties:
- `name` - The name of the animation that's referenced in some options and that can be called from the webpage.
- `headStill` - An optional parameter *(Assumed to be `false` if left out entirely)*. It's used to tell whether to keep the head servos still for the duration of the animation. Either `true` or `false`.
- `frames` - A list of frames that describe all the positions of the animation. **At least 1 frame must be specified**.

A single `frame` has the following properties:
- `speed` - How long does it take to animate from the last frame to this frame. *Is ignored if the first frame of the animation*.
- `still` - How long to keep the specified position *still*.
- `position` - The actual position that's animated to / from.

A `position` describes an pose that Bon-bon can make. Each key of a position is a name of a servo, and the value is a number between `0` and `100` *or `null`.*

A servo can also have a value of `null`, which basically means *"No movement"* or *"Keep the last servo value"*. If a servo is not defined, then it's assumed to be `null`.


Below is an example animation, with all servos being `head1`, `torso2` and `eye3`:
```json
{
  "name": "wave",     // Animation name is "wave"
  "headStill": false, // Don't ignore head servos in this animation
  "frames": [
    {
      "speed": 69,    // Doesn't matter as we're in the first frame.
      "still": 200,   // Keep this frame still for 200 milliseconds
      "position": {
        "head1": 90,  // `head1` servo is set to 90
        "torso2": 10, // `torso2` servo is set to 10
        "eye3": 10    // `eye3` servo is set to 10
      }
    },
    {
      "speed": 500,   // Animate to this frame in 1000 milliseconds
      "still": 1000,  // Keep this frame for 1000 milliseconds
      "position": {
        "head1": 50,     // `head1` servo is set to 50
        "torso2": null,  // `torso2` servo uses the last value 10, meaning it does nothing
        "eye3": 90       // `eye3` servo is set to 90
      }
    },
    {
      "speed": 1000,  // Animate to this frame in 1000 milliseconds
      "still": 1000,  // Keep this frame for 1000 milliseconds, after which this animation ends (last frame).
      "position": {
        "head1": 40,  // `head1` servo is set to 40
        "torso2": 70, // `torso2` servo is set to 70
        "eye3": 10    // `eye3` servo is set to 10
      }
    }
  ]
}
```



### Options

Interesting options that can be changed in `server/res/options.json`. You can change the options during runtime but you need to reload options from the client for the new option to come into effect. 

| Option name | Value | Description |
| :-: | :-: | :- |
| `RASPBERRY_IP` | IPV4 address | The IP address of the Raspberry Pi on the network. *If the server is started and this isn't valid, this may be replaced with the actual address.* |
| `RASPBERRY_PORT` | A port number | The port where node-red is hosted on the Raspberry Pi |
| `RECEIVED_IMAGE_TYPE` | `jpg`, `png`, `bmp`... | The image type that's received sent from the camera endpoint. |
| `CAMERA_TIMEOUT` | Number of miliseconds | How long will wait for the camera endpoint to respond when data is requested. |
| `MIN_SCORE` | Number between `0` and `1` | How confident must be to label a person in a captured image. `0 = Less confident` and `1 = More confident` |
| `CAMERA_SLEEP` | Number of milliseconds. **Must be greater than `1`** | Basically how fast the code runs or how long the program waits until doing anything with the camera again. |
| `SERVO_SLEEP` | Number of milliseconds. **Must be greater than `1`** | Same as `CAMERA_SLEEP` but for servos. |
| `TRANSITION_SPEED` | Number of milliseconds |  |
| `LOOK_FOR_ANIMATION` | Animation name | The name of the animation that's played when looking for a person. |
| `DISTANCE_TRESHOLD` | *TODO* | *TODO* |
| `EYE_X_RELATION` | *TODO* | *TODO* |
| `EYE_Y_RELATION` | *TODO* | *TODO* |
| `NECK_X_RELATION` | *TODO* | *TODO* |
| `SERVO_MOVE_DURATION` | *TODO* | *TODO* |
| `IDLE_INTERVAL` | *TODO* | *TODO* |
| `ACT_ANIMATIONS` | List of animation names | A list of animations from which an animation is chosen to be played when Bon-bon finds a person. |
| `DEFALUT_POSITION` | *TODO* | *TODO* |
| `SERVO_MAPS` | ***a really simple object :DD*** | The ranges where the specified servos values are actually mapped to. *Danger around these values* |



## Troubleshooting

### "I cannot `npm install`/`npm ci`"

Alright, so *if* the problem is caused by the package `@tensorflow/tfjs-node`, I might have the stupidest solution to a problem I've EVER witnessed.

So for me, the problem was that **`npm` was trying to copy the a file from `@tensorflow/tfjs-node/dist/tensorflow.dll` to `@tensorflow/tfjs-node/lib/napi-v9/tensorflow.dll`**

The problem with this is `npm` creates a folder named `napi-v8` and the copying fails!

This results in the most ass hack ever I've ever done:

1. Start `npm install` or `npm ci` as usual.
1. Monitor the `@tensorflow/tfjs-node/` in file manager or something.
1. When the folder `lib` appears IMMEDIATELY create a new folder named `napi-v9` in it! 
    - *I recommend using the command ```mkdir "node_modules\@tensorflow\tfjs-node\lib\napi-v9\"``` and running it when `lib` folder appears*
1. `npm` should finish normally if done right.
1. Check that the folder that you created contains the file file `tensorflow.dll`. 
1. Move the `tensorflow.dll` file to the `napi-v8` folder and remove the `napi-v9` folder.

**WTF??**


### *"I cannot locate my Raspberry Pi"*

*I assume that you've tried to launch the program and it starts yelling at you right away and/or exits.*

**TLDR; Find the Raspberry Pi's IP in your local network.**

LR; The easiest solution for this is to launch the Rasperry Pi, and look what IP is given to it from there. (or using some other *fancy* way). Either way, ***finding the Rasperry Pi's IP is the most pain in the ass in this whole process.***

Once you have it, set the `RASPBERRY_IP` value in `server/options.json` to IP you just found.

**It still doesn't work**

*You may be **very** fucked, but here are some things you can still try:*
1. Check if you and the Rasperry Pi are connected on the same network.
1. Check if the node-red server is running on the right port (usually 1880). On the server side the port should be printed everytime the server is ran to the console.
1. Check if your firewall or the Rasperry Pi's firewall are blocking any requests to port 1880 or from 1880, but this really shouldn't be the case.
1. *You can also check the source code if I've fucked up and chaged port. \:,)*


<!-- ## Architecture

*lmao this diagram is already outdated*
**Here's a nice diagram:** 

![](https://github.com/Jormala/bon-bon/assets/82582260/d5e6e397-b91e-43ef-b990-560abf31cdeb)

TODO -->












<!--
TODO:
- remember the gpiod daemon command
  - make it start when raspberry starts (maybe use `exec` -node?)
- make camera response faster (maybe using websockets or video streaming)
- don't make the camera jiggle when looking (add constants when calculating differences)
? What are minimum and maximum pulse times in the "pgiod node-red" palette

- manual animations will not DON'T use head servos (by default)
? add a parameter to animations



ANIMATOR IDEA DUMP:
- Problem: We may want to have 2 animations playing at once *kinda*
- We have the looking animation, and the actual "animation" (the act) that are playing at once
- We need to combine these animation together, so both animations can act.
- i fucking hate everything

- BECAUSE WE DON'T NEED TO MAKE THIS STUPID COMPLICATED:
  - You can probably just add an another variable to animator, called "headAnimation" (or something), that also
   animates at the same time as the "bodyAnimation".
  - then we just combine the servos that we get from the both of them (using .fillWith) and send that position 
   to the raspberry
  - (probably have defined for each animation what servos they use aswell)
    - make sections of the body aswell (head, left-arm, right-arm, torso...) so it becomes easier
    - no why would you do this

IGNORE EVERYTHING ABOVE ABOUT ANIMATOR HERE WE GO: 
- You'll have an list of servos, and you'll assign an animation to each one.
- An animation is then responsible for controlling the servos that it was assined.
- You cannot have 2 animations control 1 servo.
  - If this is tried, you could have the following options:
    1. Remove the animation that is controlling the servo, and then add your animation
    2. Throw an exception
    3. Don't use the animation.
    x. Wait for the animation to finish. DON'T DO THIS implementing this will fucking suck

What you'll have to change:
- Animation will have to specify which servos it controls
- New variable to animator, that specifies the list of current animations.
- Animator will have to have better logic for adding animations.
- Set animation will mean something entirely different
- When getting current servo values, for each animation (in the new list in animator), use .fillWith
   on all the animations to get the final position.

- i have no idea how transitions should work. maybe you should add an `onAnimationEnd` function to 
   animations. it shouldn't be THAT hard :DD
- ANOTHER GENIOUS IDEA: Add a frame to the loaded animation from the currentPosition
  - you'd need to modify the "Speed" value of the first real frame for this to work :/


TODO LIST FOR 30.11.2023 (in order of importance)
1. !!! FIND A WAY TO STREAM VIDEO FROM THE RASPBERRY. PROBABLY THE MOST IMPORTANT TODO !!!
2. Finalize the general loop
3. Add basic neck turning logic
4. Fix controller inputs from client (most of them don't work)

- TEST THE EXEC NODE IN NODE RED WHEN AT SCHOOL

/\/\/\ !!! THATS A LOT OF WORK !!! /\/\/\
-->
