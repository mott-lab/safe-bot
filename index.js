'use strict';

const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
let safetrek_access_token;
let refresh_token;

// Import dependencies and set up http server
const
  express = require('express'),
  bodyParser = require('body-parser'),
  request = require('request'),
  app = express().use(bodyParser.json()); // creates express http server


// Sets server port and logs message on success
app.listen(process.env.PORT || 1337, () => console.log('webhook is listening'));

// Creates the endpoint for the webhook
app.post('/webhook', (req, res) => {

  let body = req.body;

  // Check this is an event from a page subscription
  if (body.object === 'page') {
    // Iterates over each entry - there may be multiple entries if batched
    body.entry.forEach(function(entry) {
      // Gets the message. entry.messaging is an array, but will only ever
      // contain one message, so we get index 0
      let webhook_event = entry.messaging[0];
      // console.log(webhook_event);

      // Get sender PSID
      let sender_psid = webhook_event.sender.id;
      console.log('Sender PSID: ' + sender_psid);

      // Check if the event is a message or postback and act accordingly
      if (webhook_event.message) {
        handleMessage(sender_psid, webhook_event.message);
      } else if (webhook_event.postback) {
        handlePostback(sender_psid, webhook_event.postback);
      }
    });

    // Returns a '200 OK' response to all requests
    res.status(200).send('EVENT_RECEIVED');
  } else {
    // Returns a '404 Not Found' if event is not from a page subscription
    res.sendStatus(404);
  }

});

// Add support for GET requests to the webhook
app.get('/webhook', (req,res) => {

  // Your verify token. Should be a random string.
  let VERIFY_TOKEN = process.env.FB_VERIFY_TOKEN;

  // Parse the query params
  let mode = req.query['hub.mode'];
  let token = req.query['hub.verify_token'];
  let challenge = req.query['hub.challenge'];

  let safetrek_auth_code = req.query.code;

  // Checks if a token and mode is in the query string of the request
  if (mode && token) {
    // Checks that the mode and token sent are correct
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      // Responds with the challenge token from the request
      console.log('WEBHOOK_VERIFIED');
      res.status(200).send(challenge);
    } else {
      // Reponds with '403 Forbidden' if verify tokens do not match
      res.sendStatus(403);
    }
  } else if (safetrek_auth_code) {
    console.log('SAFETREK AUTHORIZATION CODE RECEIVED: ' + safetrek_auth_code);
    res.sendStatus(200);
    retrieveSTAccessTok(safetrek_auth_code);
  }

});

// Handle message events
function handleMessage(sender_psid, received_message) {
  let response;

  // Check if the message contains text
  if (received_message.text) {
    if (received_message.text === 'info') {
      response = {
        "text": "SafeBot is here to help. If you experience an emergency, you can send \"help\" at any time. We will take you through steps to get the help you need and someone from SafeTrek will contact you. For specific situations, send \"police\", \"fire\", or \"medical\" to send an alert to the police, the fire department, or emergency medical services, respectively."
      }
    } else if (received_message.text === 'help') {
      response = {
        "attachment": {
          "type": "template",
          "payload": {
            "template_type": "generic",
            "elements": [{
              "title": "If you need help, press one of the buttons below. For more general information about SafeBot, type \"info\".",
              "buttons": [
                {
                  "type": "postback",
                  "title": "Police",
                  "paylod": "police"
                },
                {
                  "type": "postback",
                  "title": "Fire",
                  "paylod": "fire"
                },
                "type": "postback",
                "title": "Medical",
                "paylod": "medical"
              ]
            }]
          }
        }

      };

    } else if (received_message.text === 'police') {

    } else if (received_message.text === 'fire') {

    } else if (received_message.text === 'medical') {

    }

    // generic response when keyword is not sent
    else {
      // create payload for basic text message
      response = {
        "text": `You sent the message: "${received_message.text}"`
      }
    }
  } else if (received_message.attachments) {
    // case where attachment contains a location
    if (received_message.attachments[0].payload.coordinates) {
      //get the URL of the message attackment
      let lat = received_message.attachments[0].payload.coordinates.lat;
      let long = received_message.attachments[0].payload.coordinates.long;
      response = {
          "text": "Location received. We are sending help. One of our call center employees will be on this conversation in a moment. \nIf you want, you can share your phone number and we will contact you that way.",
          "quick_replies":[
            {
              "content_type":"user_phone_number"
            }
          ]
      };

      console.log("***GENERATE ALERT***\nDispatch help to:\nLat: " + lat + "\nLong: " + long);
    }
  }

  // send the response message
  callSendAPI(sender_psid, response);

}

// Handle messaging_postbacks events
function handlePostback(sender_psid, received_postback) {
  let response;

  // get the payload for the postback
  let payload = received_postback.payload;

  // set appropriate response
  if (payload === 'yes') {
    response = { "text": "Thanks!" };
  } else if (payload === 'no') {
    response = { "text": "Sorry about that. Try sending another." };
  } else if (payload === 'get_started') {

    // When get_started is returned, it is the first time the user interacts with SafeBot. Need to log in.
    let url_string = "https://account-sandbox.safetrek.io/authorize?audience=https://api-sandbox.safetrek.io&client_id=" + process.env.CLIENT_ID + "&scope=openid%20phone%20offline_access&state=statecode&response_type=code&redirect_uri=https://safe-bot.herokuapp.com/webhook";
    response = {
      "attachment": {
        "type": "template",
        "payload": {
          "template_type": "generic",
          "elements": [{
            "title": "Hello! If you need help, press the button below to login to SafeTrek. If you want to learn more about what we can do for you, type \"info\" at any time.",
            "buttons": [
              {
                "type": "web_url",
                "title": "Login",
                "url": url_string
              }
            ]
          }]
        }
      }
    };


  } else if (payload === 'safetrek_login') {

  } else if (payload === 'police') {

  } else if (payload === 'fire') {

  } else if (payload === 'medical') {

  } else if (payload === 'no_help_wanted') {

  }

  // send message to ack the postback
  callSendAPI(sender_psid, response);
}

function retrieveSTAccessTok(safetrek_auth_code) {
  let request_body = {
    "grant_type": "authorization_code",
    "code": safetrek_auth_code,
    "client_id": process.env.CLIENT_ID,
    "client_secret": process.env.CLIENT_SECRET,
    "redirect_uri": "https://safe-bot.herokuapp.com/webhook"
  }

  request({
    "uri": "https://login.safetrek.io/oauth/token",
    "headers": "Content-Type: application/json",
    "method": "POST",
    "json": request_body
  }, (err, res, body) => {
    if (!err) {

      let info = JSON.parse(body);
      let access_token = info.access_token;
      let refresh_token = info.refresh_token;
      let token_type = info.token_type;
      let expires_in = info.expires_in;
      let scope = info.scope;

      console.log("SafeTrek access token attained:" + access_token);
      safetrek_access_token = access_token;
      safetrek_refresh_token = refresh_token;
    } else {
      console.error("Unable to attain SafeTrek access token:" + err);
    }
  });
}

// Send response messages via the Send API
function callSendAPI(sender_psid, response) {
  // construct message body
  let request_body = {
    "recipient": {
      "id": sender_psid
    },
    "message": response
  }

  // send the HTTP request to the Messenger Platform API
  request({
    "uri": "https://graph.facebook.com/v2.6/me/messages",
    "qs": { "access_token": PAGE_ACCESS_TOKEN },
    "method": "POST",
    "json": request_body
  }, (err, res, body) => {
    if (!err) {
      console.log('message sent!');
    } else {
      console.error("Unable to send message:" + err);
    }
  });
}
