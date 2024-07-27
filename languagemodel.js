const fs = require('fs')
require('dotenv').config()
const { getJson } = require("serpapi")
const axios = require('axios')
const cheerio = require('cheerio')
const { OpenAI } = require("openai")
const openai = new OpenAI({
  apiKey: process.env.OPENAIKEY,
})
const embeddings = new OpenAIEmbeddings({
    openAIApiKey: process.env.OPENAIKEY, // Use the same env variable name as in your existing code
  });
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
let vectorStore

try {
    let data = fs.readFileSync('conversations.json', 'utf8') // Read file synchronously
    conversations = JSON.parse(data) // Parse JSON data
    console.log('conversations:', conversations) // Access the summaries
  } catch (err) {
    console.error(`Error reading or parsing conversations: ${err}`)
  }

try {
  let data = fs.readFileSync('conversationsummariesshort.json', 'utf8') // Read file synchronously
  conversationSummariesShort = JSON.parse(data) // Parse JSON data
  console.log('Short Conversation Summaries:', conversationSummariesShort) // Access the summaries
} catch (err) {
  console.error(`Error reading or parsing conversation summaries: ${err}`)
}

try {
    let data = fs.readFileSync('conversationsummarieslong.json', 'utf8') // Read file synchronously
    conversationSummariesLong = JSON.parse(data) // Parse JSON data
    console.log('Long Conversation Summaries:', conversationSummariesLong) // Access the summaries
  } catch (err) {
    console.error(`Error reading or parsing conversation summaries: ${err}`)
  }



// Serve static files from the 'public' directory (assuming your index.html is there)
app.use(express.static(path.join(__dirname)))

function estimateTokenCount(text) {
  return Math.ceil(text.length / 4);
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


  async function checkIfMessageRefersToEarlierConversation(message,previousconversations){
    console.log(message,previousconversations)
    try {
      const response = await openai.chat.completions.create({
          messages: [{ role: "system", content: `Here is a message "${JSON.stringify(message)}". Here are some summaries of previous conversations.
            "${JSON.stringify(previousconversations)}". If the message seems to refer to one of these conversations, return the number of the 
            conversation as a digit. The first conversation in the array is 1, the second is 2 and so on. 
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
  console.log(tokencount,"tokencount",`Summarize the following conversation in ${tokencount/10} tokens:\n${conversation}` )
  try {
    const completionshort = await openai.chat.completions.create({
        messages: [{ role: "user", content: `Summarize the following conversation in ${tokencount/8} tokens:\n${conversation}` }],
        model: "gpt-3.5-turbo-0125",
        max_tokens:2000
      })
    const completionlong = await openai.chat.completions.create({
      messages: [{ role: "user", content: `Summarize the following conversation in ${tokencount/2} tokens:\n${conversation}` }],
      model: "gpt-3.5-turbo-0125",
      max_tokens:2000
    })
    conversationSummariesShort.push(completionshort.choices[0].message.content)
    conversationSummariesLong.push(completionlong.choices[0].message.content)    
    await saveConversations(conversation)
    await saveConversationSummariesShort()
    await saveConversationSummariesLong()
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



