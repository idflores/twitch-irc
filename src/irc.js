/*
Developer: Israel Flores (www.github.com/idflores)

File Name: irc.js

Purpose: defines the main IRC class and functionality

**Code.written() with <3 in Babel**


LICENSE:

This file is part of Twitch-IRC.

Twitch-IRC is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

Twitch-IRC is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with Foobar.  If not, see <http://www.gnu.org/licenses/>.
*/

// calls the node.js `net` library for TCP/IP communication
import Net from 'net'
import Msg from './msg.js'
import EventEmitter from 'events'

// @personal-note:
//  Using module.exports to make the class publicly available following:
//  http://stackoverflow.com/questions/33505992/babel-6-changes-how-it-exports-default
module.exports = class IRC {
  /*
    @function: constructor(oauth, username, debug_mode <false>)
    @description: Makes an instance of the IRC client

      @param: oauth
      @description: an alphaNumeric key given by Twitch.tv here
                    https://dev.twitch.tv/docs/v5/guides/authentication/

      @param: username
      @description: **your** Twitch username

      @param: debug_mode
      @default: false
      @description: pass `true` if you desire to view _everything_ the Twitch
                    IRC server responds in the console;
                    `false` will cause only chat messages to output to
                    the console IF `console_out` is set to `true`
  */
  constructor(oauth, username, debug_mode = false) {

    // initialize properties from parameters
    this.oauth = oauth
    this.username = username
    this.debug_mode = debug_mode

    // initialize an array property to keep a server response history
    let history = this.history = []

    // initialize channel
    let channel = this.channel = []

    // initialize variable for state of Socket connection to Twitch
    let clientState = this.clientState = new Object()
    this.clientState.state = false

    // establish a connection Socket to the Twitch IRC server
    let client = this.client = Net.connect(6667, 'irc.chat.twitch.tv')
    // sets the output protocol for the 'net' Socket buffer that holds data
    // whenever the Twitch server responds
    client.setEncoding('utf8');

    // EVENTS //
    let chatEvents = this.chatEvents = new EventEmitter()

    // LISTENERS //

    // @listener: 'connect'
    // @description: listening for successful `connect` event emitted by
    //               the `net` Socket
    client.addListener('connect', function() {

      // authenticate this IRC client with the Twitch IRC server
      client.write('PASS ' + oauth + '\r\n')
      client.write('NICK ' + username.toLowerCase() + '\r\n')

      // @console: debug connection
      if (debug_mode) {
        console.log('Established connection')
        console.log(client.address())
      }
      else console.log('You\'re connected!')

      clientState.state = true
    })

    // @listener: 'data'
    // @description: listens for `data` event emitted by the `net` Socket
    //               and outputs the data recieved from the Socket buffer
    client.addListener('data', function(message) {
       serverResponse(message, history, client, debug_mode, chatEvents)
    })

    // @listener: 'error'
    // @description: listening for failed connection attempt and any other
    //               errors emitted by the `net` Socket
    client.addListener('error', function(exception) {
      if (debug_mode) {
        console.log('ERROR with Twitch server')
        console.log(exception.toString())
      }
      else console.log('ERROR: Check your username and password')

      clientState.state = false
    })

    // @listener: 'end'
    // @description: listening for the `end` event from the `net` Socket
    //               when the Twitch server has disconnected
    client.addListener('end', function() {
      clientState.state = false
      console.log('You have disconnected.')
    })
  } // END Constructor

  /*
    @function: join()
    @description: joins a twitch chat channel

      @param: channel
      @description: takes the channel name desired
  */
  join(channel) {
    let debug_mode = this.debug_mode
    let this_channel = this.channel

    // checks to make sure `Socket` is connected to Twitch before moving on
    try {
      if (this.clientState.state === false) {
        throw 'ERROR'
      }
    }
    catch(e) {
      setTimeout(() => this.join(channel), 1000)
      return
    }

    // make sure the channel has not been joined already
    try {
      if (this.channel.includes(channel)) {
        throw "ERROR: Channel already joined"
      } // END IF

      console.log('Joining ' + channel + '...')

      let history = this.history
      let client = this.client

      // retry connection every 0.5 seconds
      let attemptID = setInterval( function() {
          client.write('JOIN #' + channel.toLowerCase() + '\r\n')
      }, 500) // END setInterval()

      // check to see if the channel has been joined
      let monitorID = setInterval( function() {
        // twitch sends 3 messages in succession when joining a channel
        // it's best to check the 3rd to last for stability
        let lastIndex = history.length - 3

        // Sometimes, history takes a moment to instantiate
        // Try/Catch quiets that exception and increases stability
        try {
          if (history[lastIndex].tag === 'JOIN') {
            console.log('You have joined ' + channel + '!')
            clearInterval(attemptID)
            clearInterval(monitorID)
            clearTimeout(timerID)
            this_channel.push(channel)
          }
        } // END TRY

        catch(e) {
          if (debug_mode) {
            console.log('WARNING: failed to join ' + channel +
                        '. Trying again...')
          }
        } // END CATCH

      }, 20) // END setInterval()

      // make sure we don't try to join forever ;)
      let timerID = setTimeout( function() {
        console.log("ERROR: Cannot join " + channel +
                    ". Check your spelling...")
        clearInterval(attemptID)
        clearInterval(monitorID)
      }, 5000)

    } // END TRY

    catch(e) {
      console.log(e)
    } // END CATCH
  } // END join()

  /*
    @function: chat()
    @description: sends a message to the Twitch server on the current channel

      @param: message
      @description: the message to be sent

      @param: channel
      @default: null
      @description: can specify a channel to chat
                    must be a channel already joined
                    if `null` will default to the last channel joined
  */
  chat(message, channel = null) {
    try {
      // default, send to last channel joined
      if (channel === null) {
        let lastIndex = this.channel.length - 1
        if (lastIndex === -1) {
          throw "ERROR: You must join a channel first"
        }
        this.client.write('PRIVMSG #' +
                          this.channel[lastIndex].toLowerCase() +
                          ' :' + message + '\r\n')
        // Twitch does not echo chat messsages from a client
        // add this message to the history
        let newChat = new Msg()
        newChat.meta_host = this.username
        newChat.host = 'tmi.twitch.tv'
        newChat.tag = 'PRIVMSG'
        newChat.channel = this.channel[lastIndex]
        newChat.message = message
        this.history.push(newChat)
      }

      // send to specified channel
      else {
        if (this.channel.includes(channel)) {
          this.client.write('PRIVMSG #' + channel.toLowerCase() +
                            ' :' + message + '\r\n')
          // Twitch does not echo chat messsages from a client
          // add this message to the history
          let newChat = new Msg()
          newChat.meta_host = this.username
          newChat.host = 'tmi.twitch.tv'
          newChat.tag = 'PRIVMSG'
          newChat.channel = channel
          newChat.message = messsage
          this.history.push(newChat)
        }
        else {
          throw "ERROR: You must chat a channel that has already been joined"
        }
      } // END IF
    } // END TRY

    catch(e) {
      console.log(e)
    } // END CATCH

  } // END chat()

  /*
    @function: leave()
    @description: leaves a joined channel

      @param: channel
      @default: null
      @description: can specify a channel to leave
                    must be a channel already joined
                    if `null` will default to the last channel joined
  */
  leave(channel = null) {
    try {
      // default, leave last channel joined
      if (channel === null) {
        let lastIndex = this.channel.length - 1
        if (lastIndex === -1) {
          throw "ERROR: You called \"leave()\"." +
                " You have not joined a channel yet"
        }
        this.client.write('PART #' + this.channel[lastIndex].toLowerCase() +
                          '\r\n')
        console.log('You left ' + this.channel[lastIndex])
        this.channel.pop()
      }

      // leave specified channel
      else {
        if (this.channel.includes(channel)) {
          this.client.write('PART #' + channel.toLowerCase() + '\r\n')
          console.log('You left ' + channel)
          this.channel.splice(this.channel.indexOf(channel), 1)
        }
        else {
          throw "ERROR: Cannot leave" + channel +
                ". You have not joined that channel yet."
        }
      } // END IF
    } // END try

    catch(e) {
      console.log(e)
    } // END CATCH

  } // END leave()

  /*
    @function: getChannels()
    @description: wrapper to return the list of current channels joined

    @return: this.channel
    @description: returns the array of all currently joined channels
  */
  getChannels() {
    if (this.channel.length === 0) {
      console.log('Channel List: <no joined channels>')
    }
    else {
      console.log('Channel List: ' + this.channel)
    }
    return this.channel
  }

  /*
    @function: getChatHistory()
    @description: returns history of all server messages

      @param: verbose
      @default: false
      @description: is overridden by `debug_mode` from the IRC class
                    if `true`, will output history object to console
                    if `false` **AND** `debug_mode` is `false`,
                      will only output Twitch `PRIVMSG` history to console

    @returns: history
    @description: if `verbose` is set to `true`, returns the `history` array
                  if `false`, will return an array of only Twitch `PRIVMSG`
                    including **only** the `channel`, `user`, and the `message`
                    as a concatenated `String`
  */
  getChatHistory(verbose = false) {

    // outputs and returns debug history including each `Msg` object
    if (this.debug_mode || verbose) {
      console.log(this.history)
      return this.history
    }

    // outputs & returns only Twitch `PRIVMSG`
    else {
      let chatHistory = []
      console.log('HISTORY=========================')
      for (let i = 0; i < this.history.length; i++) {
        if (this.history[i].tag === `PRIVMSG`) {
          console.log('[' + this.history[i].channel + '] ' +
                      this.history[i].meta_host + ': ' +
                      this.history[i].message)
          let newMsg = '[' + this.history[i].channel + '] ' +
                       this.history[i].meta_host + ': ' +
                       this.history[i].message
          chatHistory.push(newMsg)
        }
      } // END FOR
      console.log('END HISTORY=====================')
      return chatHistory
    } // END IF


  } // END getHistory()

} // END Class


// IRC CLASS TOOLS //
/*
  Babel/EC6 does not support a Babel function to be called in the `callback`
    EventEmitter.addListener(<event>, <callback>) function. As a result, some
    utility functions must be declared outside the IRC class. :/
*/

/*
  @function: serverResponse(message)
  @description: handles responses from the Twitch Server

    @param: rawData
    @description: the data `Buffer` object given by the `net` Socket
                  instantiated in the IRC constructor

    @param: history
    @description: reference to the server messages `history` array in `IRC`

    @param: client
    @description: the current `net` socket connection to Twitch

  Notes: Great resource when developing the parsing algorithm
         String: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String
         RegExp: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/RegExp
*/
function serverResponse(rawData, history, client, debug_mode, chatEvents) {
  /*
    Schema: the `Buffer` given by the `Socket` can carry multiple lines of
            data. The following code is structured into the following manner:

              `rawData` is the `String` representation of the `Buffer` data
              recieved from the server. It is split into `Msg` objects and
              stored in `history`

              `history` is a limited, growing array of `Msg` objects

              `Msg` is excately *one* line recieved from the Twitch server
              and includes parsed details (see msg.js for more information)

            The process models the following:

              (1) rawData >> Msg : separate the rawData into actual lines
                                   recieved from the server

              (2) Msg >> history : store `Msg` objects as an array of
                                        lines recieved from the server
  */

  // convert the server response to a `Buffer` object
  rawData = rawData.toString()

  // initialize the `RegExp` for the host name anchor
  let twitchExp = new RegExp(/tmi\.twitch\.tv/)
  let jtvExp = new RegExp(/:jtv/)

  // Loop: splits 'rawData' into single lines of code and parses them
  while (rawData.search(/\r\n/) !== -1) {

    // initialize index to track the current server response in our `history`
    let endIndex = null
    let colonIndex = null
    let channelIndex = null
    let spaceIndex = null
    let hostIndex = null
    let metaIndex = null

    // SPLIT //

    // Searches for the first instance of the `\r\n` line delimitter and
    // and stores a single line recieved from the server in `Msg.raw`
    endIndex = rawData.search(/\r\n/)

    // Keep only 200 server messages
    if (history.length > 200) history.shift()
    history.push(new Msg())

    let index = (history.length - 1)
    history[index].raw = rawData.substring(0, endIndex)

    // since the first line has been stored, remove that line from the
    // rawData to prepare for evaluating the next line
    rawData = rawData.substring(endIndex + 2)


    // PARSE //

    try {
      // handle `tmi.twich.tv` messages
      if (history[index].raw.search(twitchExp) !== -1) {

        // making a copy of `Msg.raw` so we can delete portions as we parse
        let temp = history[index].raw

        // initialize parse utility indexes
        hostIndex = temp.search(twitchExp)
        colonIndex = temp.search(/:/)

        // check and answer `PING` messages from the server
        if (temp.search(/PING/) !== -1) {
          history[index].host = 'tmi.twitch.tv'
          history[index].tag = 'PING'
          client.write('PONG :tmi.twitch.tv \r\n')
          continue
        } // END "ping" IF

        // get `Msg.meta`
        if (colonIndex !== 0) {
          history[index].meta = temp.substring(0, colonIndex)
          temp = temp.substring(colonIndex)
        }

        // get `Msg.meta_host`
        if (hostIndex - colonIndex !== 1) {
          history[index].meta_host = temp.substring(colonIndex + 1,
                                                    hostIndex - 1)

          // check the formating of `meta_host`
          // sometimes it's `<user>!<user>@<user>`
          if (history[index].meta_host.search(/\!/) !== -1) {
            metaIndex = history[index].meta_host.search(/\!/)
            history[index].meta_host =
              history[index].meta_host.substring(colonIndex, metaIndex)
          }

          temp = temp.substring(hostIndex - 1)
          hostIndex = 1
        }

        // get `Msg.host`
        history[index].host = temp.match(twitchExp).toString()
        temp = temp.substring(hostIndex + 14)

        // get `Msg.message`
        // getting rid of the message will make it easier to evaluate later
        if (temp.search(/:/) !== -1) {
          colonIndex = temp.search(/:/)
          history[index].message = temp.substring(colonIndex + 1)
          temp = temp.substring(0, colonIndex - 1)
        }

        // get `Msg.channel`
        if (temp.search(/#/) !== -1) {
          channelIndex = temp.search(/#/)
          history[index].channel = temp.substring(channelIndex + 1)
          temp = temp.substring(0, channelIndex - 1)
        }

        // get `Msg.status`
        if (!isNaN(temp.substring(0, 3))) {
          history[index].status = temp.substring(0, 3)
          temp = temp.substring(4)
        }

        // get `Msg.user`
        // there will never be an IRC command less than 3 uppercase characters
        if (temp.substring(0, 3) !== temp.substring(0, 3).toUpperCase()) {
          spaceIndex = temp.search(' ')

          // a space denotes a command exists
          if (spaceIndex !== -1) {
            history[index].user = temp.substring(0, spaceIndex)
            temp = temp.substring(spaceIndex + 1)
          }
          else {
            history[index].user = temp
            temp = null
          }
        }

        // get `Msg.tag`
        // the command is the only thing left at this point
        if (temp !== null) {
          history[index].tag = temp
        }


      } // END 'tmi.twitch.tv' IF

      // handle `jtv` messages
      else if (history[index].raw.search(jtvExp) !== -1) {
        // currently, there is only *one* case that the legacy jtv server is
        // still used --> channel mod/unmod member

        let temp = history[index].raw.split(' ')
        history[index].host = temp[0].substring(1)
        history[index].tag = temp[1]
        history[index].channel = temp[2].substring(1)
        history[index].jtv_action = temp[3]
        history[index].user = temp[4]
      }

      // currently, no support for other Twitch IRC server hosts
      // ...if they exist
      else {
        throw "ERROR: Cannot identify the host!"
      }
    }

    catch(e) {
      history[index].error = e;
      console.log(history[index].error)
      continue
    } // END try/catch


    // LIVE CONSOLE & CHAT OUTPUT //

    /*
      @call: EventEmitter.emit(<event_name>, <arg_1>, ..., <arg_N>)
        @event_name: 'message'
        @<arg_1>: current channel
        @<arg_2>: who the message is from
        @<arg_3>: the message itself
    */
    // if `debug_mode` is TRUE, emit the current `Msg` object
    if (debug_mode) {
      console.log(history[index])
      chatEvents.emit('message', history[index])
    }

    // otherwise, only emit the important portions of a PRIVMSG message
    else {
      if (history[index].tag === 'PRIVMSG') {
          console.log('[' + history[index].channel + '] ' +
                      history[index].meta_host + ': ' +
                      history[index].message)
          chatEvents.emit('message',
                          history[index].channel,
                          history[index].meta_host,
                          history[index].message)
      }
    } // END IF

  } // END WHILE

} // END serverResponse()
