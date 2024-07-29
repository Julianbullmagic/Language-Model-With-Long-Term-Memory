const fs = require('fs')
require('dotenv').config()
const { getJson } = require("serpapi")
const axios = require('axios')
const cheerio = require('cheerio')
const { OpenAI } = require("openai")
const openai = new OpenAI({
  apiKey: process.env.OPENAIKEY,
})
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASEURL
const supabaseAnonKey = process.env.SUPABASEKEY

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function getSummaries() {
  try {
    let { data, error } = await supabase.from('summaries').select('*');
    console.log(data)
    for (let summary of data){
      conversationSummariesShort.push(summary.shortsummary)
      conversationSummariesLong.push(summary.longsummary)
      conversations.push(summary.fullconversation)
    }
    if (error) {
      console.error(error);
    } else {
      console.log(data,"SUMMARIES!!!!!!!!!");
    }
  } catch (error) {
    console.error(error);
  }
}


const express = require('express')
const path = require('path')
const { Server } = require("socket.io")
let searchengines=["google_maps",
    "duckduckgo","bing","yandex","yahoo","google"
  ]
const app = express()
const port = 3000
const server = app.listen(port, () => console.log(`Server listening on port ${port}`))
const io = new Server(server)

let conversationSummariesShort=[]
let conversationSummariesLong=[]
let conversations=[]

  getSummaries()




// Serve static files from the 'public' directory (assuming your index.html is there)
app.use(express.static(path.join(__dirname)))

function estimateTokenCount(text) {
  return Math.ceil(text.length / 4);
}


async function getSingleResponse(conversation) {
  console.log(conversation)
  try {
      const completion = await openai.chat.completions.create({
          messages: conversation,
          model: "gpt-3.5-turbo-0125",
        })
        return completion.choices[0]
    } catch (err) {
      console.log(err)
      return "An error occurred. Please try again later."
    }
}



io.on('connection', (socket) => {
  console.log('Client connected')
  console.log(conversationSummariesShort,"Sending Short Conversation Summaries because starting new conversation")
  socket.emit('starting new conversation', JSON.stringify(conversationSummariesShort))

  let conversation = [] // Initialize conversation array per connection

  socket.on('start new conversation', async () => {
    console.log(conversationSummariesShort,"Sending Short Conversation Summaries because starting new conversation")
    socket.emit('starting new conversation', JSON.stringify(conversationSummariesShort))
  })

  socket.on('chat message', async (messageData) => {
    let conversation = JSON.parse(messageData) 
    let latestmessage=conversation[conversation.length-1]
    const regex = /\d/;
    let earlierConvo
    do {
       earlierConvo=await checkIfMessageRefersToEarlierConversation(latestmessage,conversationSummariesShort)
      console.log(earlierConvo,"earlierConvo")
    }while (!regex.test(earlierConvo))
    earlierConvo=Number(earlierConvo)
    console.log(regex.test(earlierConvo),earlierConvo)
    let longSummary
    if(earlierConvo>0){
      longSummary=conversationSummariesLong[earlierConvo-1]
      conversation.push({role:`system`,content:`The user is referring back to an earlier conversation they had with you. Here is a 
        longer summary of that conversation in order to refresh your memory. "${longSummary}"`})
        console.log(longSummary)
    }
    const response = await getSingleResponse(conversation)
    socket.emit('chat response', JSON.stringify(response['message']))
  })



  socket.on('summarize conversation', async (message) => {
    if (message) {
     await summarizeConversationAndSaveConversations(message)
    }
  })



  socket.on('disconnect', () => {
    console.log('Client disconnected')
    conversation = [] // Clear conversation array on disconnect
  })
})



  async function getSingleResponse(conversation) {
    console.log(conversation)
    try {
        const completion = await openai.chat.completions.create({
            messages: conversation,
            model: "gpt-3.5-turbo-0125",
          })
          return completion.choices[0]
      } catch (err) {
        console.log(err)
        return "An error occurred. Please try again later."
      }
  }


  async function checkIfMessageRefersToEarlierConversation(currentconversation,previouscurrents){
    console.log(currentconversation,previousconversations)
    try {
      const response = await openai.chat.completions.create({
          messages: [{ role: "system", content: `Here is a conversation "${JSON.stringify(currentconversation)}". Here are some summaries of previous conversations.
            "${JSON.stringify(previousconversations)}". If the user in the conversation is currently talking about one of the previous 
            conversations and the summary of that conversation has not already been retrieved for this current conversation, 
             Here are some summaries of previous conversations. "${JSON.stringify(previousconversations)}". If the user currently 
             seems to be refering to one of these conversations, return the index of the conversation as a digit. The indexes start at 1. 
             If the message doesn't refer to any of the conversations, return 0. Your response should only be a digit number.` }],
          model: "gpt-3.5-turbo-0125",
          max_tokens:3
        })
        return response.choices[0].message.content
    } catch (err) {
      console.log(err)
      return "An error occurred. Please try again later."
    }
  }


async function summarizeConversationAndSaveConversations(conversation) {
  let tokencount=estimateTokenCount(conversation)
  console.log(tokencount,"tokencount",`Summarize the following conversation in ${Math.floor(tokencount/15)} tokens:\n${conversation}` )
  try {
    const completionshort = await openai.chat.completions.create({
        messages: [{ role: "user", content: `Summarize the following conversation in ${tokencount/8} tokens:\n${conversation}` }],
        model: "gpt-3.5-turbo-0125",
        max_tokens:16000
      })
    const completionlong = await openai.chat.completions.create({
      messages: [{ role: "user", content: `Summarize the following conversation in ${Math.floor(tokencount/3)} tokens:\n${conversation}` }],
      model: "gpt-3.5-turbo-0125",
      max_tokens:16000
    })

    try {
      const { data, error } = await supabase
        .from('summaries')
        .insert([
          { longsummary: completionlong.choices[0].message.content, shortsummary: completionshort.choices[0].message.content },
        ]);
  
      if (error) {
        console.error(error);
      } else {
        console.log(data);
      }
    } catch (error) {
      console.error(error);
    }
    await saveConversations(conversation)

  } catch (err) {
    console.log(err)
    return "An error occurred. Please try again later."
  }
}


function saveConversations(conversation) {
    conversations.push(conversation)
    fs.writeFile("conversations.json", JSON.stringify(conversations), (err) => {
      if (err) {
        console.error(`Error saving conversations: ${err}`)
      } else {
        console.log('Conversations saved successfully.')
      }
    })
  }

function saveConversationSummariesShort() {
    fs.writeFile("conversationsummariesshort.json", JSON.stringify(conversationSummariesShort), (err) => {
      if (err) {
        console.error(`Error saving short conversation summaries: ${err}`)
      } else {
        console.log('Conversation short summaries saved successfully.')
      }
    })
  }

  function saveConversationSummariesLong() {
    fs.writeFile("conversationsummarieslong.json", JSON.stringify(conversationSummariesLong), (err) => {
      if (err) {
        console.error(`Error saving long conversation summaries: ${err}`)
      } else {
        console.log('Conversation long summaries saved successfully.')
      }
    })
  }



