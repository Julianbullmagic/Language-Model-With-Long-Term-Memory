require('dotenv').config()
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
      conversationSummariesShort.push({id:summary.id,shortsummary:summary.shortsummary})
      conversationSummariesLong.push({id:summary.id,longsummary:summary.longsummary})
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
let summariesalreadyretrieved=[]
  getSummaries()


// Serve static files from the 'public' directory (assuming your index.html is there)
app.use(express.static(path.join(__dirname)))

function estimateTokenCount(text) {
  return Math.ceil(text.length / 4);
}


io.on('connection', (socket) => {
  socket.emit('starting new conversation', JSON.stringify(conversationSummariesShort))

  let conversation = [] 

  socket.on('start new conversation', async () => {
    summariesalreadyretrieved=[]
    socket.emit('starting new conversation', JSON.stringify(conversationSummariesShort))
  })

  socket.on('chat message', async (messageData) => {
    let conversation = JSON.parse(messageData) 
    let latestmessage=conversation[conversation.length-1]
    let earlierConvos=await checkIfMessageRefersToEarlierConversation(latestmessage,conversationSummariesShort)
    earlierConvos=JSON.parse(earlierConvos)
    let longSummaries=[]
    if(earlierConvos instanceof Array){
      if(earlierConvos.length>0){
        for(let convo of earlierConvos){
          for(let conversation of conversationSummariesLong){
            if(conversation.id==convo){
              if(!summariesalreadyretrieved.includes(conversation.id)){
                longSummaries.push(conversation)
                summariesalreadyretrieved.push(conversation.id)
              }
              if(summariesalreadyretrieved.includes(conversation.id)){
                console.log("old conversation already been retrieved for this conversation")
              }
            }
          }
        }
      }
    }
    conversation.push({role:`system`,content:`The user is referring back to an earlier conversation or conversations they had with you. 
      Here is a summary or summaries to refresh your memory. "${JSON.stringify(longSummaries)}"`})
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
            model: "gpt-4o-mini",
            max_tokens:16000,
          })
          return completion.choices[0]
      } catch (err) {
        console.log(err)
        return "An error occurred. Please try again later."
      }
  }


  async function checkIfMessageRefersToEarlierConversation(message,previousconversations){
    try {
      const response = await openai.chat.completions.create({
          messages: [{ role: "system", content: `Here is a message "${JSON.stringify(message)}". Here are some summaries of previous conversations.
            "${JSON.stringify(previousconversations)}". If the message seems to refer to any of these conversations, return the id numbers of those
            conversation summaries in an array, for example [17,22,24]. If none of the conversation summaries are mentioned, just return an empty array [].` }],
          model: "gpt-4o-mini",
          max_tokens:50
        })
        return response.choices[0].message.content
    } catch (err) {
      console.log(err)
      return "An error occurred. Please try again later."
    }
  }


async function summarizeConversationAndSaveConversations(conversation) {
  summariesalreadyretrieved=[]
  let tokencount=estimateTokenCount(conversation)
  try {
    const completionshort = await openai.chat.completions.create({
        messages: [{ role: "user", content: `Summarize the following conversation in ${tokencount/12} tokens:\n${conversation}` }],
        model: "gpt-4o-mini",
        max_tokens:16000
      })
    const completionlong = await openai.chat.completions.create({
      messages: [{ role: "user", content: `Summarize the following conversation in ${Math.floor(tokencount/3)} tokens:\n${conversation}` }],
      model: "gpt-4o-mini",
      max_tokens:16000
    })

    try {
      let{ data, error } = await supabase
        .from('summaries')
        .insert([
          {  shortsummary: completionshort.choices[0].message.content,longsummary: completionlong.choices[0].message.content },
        ])
        .select()
        data=data[0]
        console.log(data,"new summary added to database")
        conversationSummariesShort.push({id:data.id,shortsummary:data.shortsummary})
        conversationSummariesLong.push({id:data.id,longsummary:data.longsummary})
      if (error) {
        console.error(error);
      } else {
        console.log(data);
      }
    } catch (error) {
      console.error(error);
    }

  } catch (err) {
    console.log(err)
    return "An error occurred. Please try again later."
  }
}




