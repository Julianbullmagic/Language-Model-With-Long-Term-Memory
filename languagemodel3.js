const fs = require('fs')
require('dotenv').config()
const { getJson } = require("serpapi")
const axios = require('axios')
const cheerio = require('cheerio')
const { OpenAI } = require("openai")
const openai = new OpenAI({
  apiKey: process.env.OPENAIKEY,
})
const { OpenAIEmbeddings } = require("@langchain/openai")
const { FaissStore } = require("@langchain/community/vectorstores/faiss")
const { RecursiveCharacterTextSplitter } = require("langchain/text_splitter")
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
let vectorStore

try {
    let data = fs.readFileSync('conversations.json', 'utf8') // Read file synchronously
    conversations = JSON.parse(data) // Parse JSON data
  } catch (err) {
    console.error(`Error reading or parsing conversations: ${err}`)
  }

  getSummaries()




// Serve static files from the 'public' directory (assuming your index.html is there)
app.use(express.static(path.join(__dirname)))

function estimateTokenCount(text) {
  return Math.ceil(text.length / 4);
}


async function initializeOrUpdateVectorStore() {
    
  if (fs.existsSync("./faiss_index")) {
    vectorStore = await FaissStore.load("./faiss_index", embeddings);
  } else {
    vectorStore = await FaissStore.fromTexts([], [], embeddings);
  }

  // Process existing conversations
  for (let conversation of conversations) {
    await addConversationToVectorStore(conversation);
  }

  console.log("Vector store initialized or updated.");
}

async function addConversationToVectorStore(conversation) {
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1000,
    chunkOverlap: 200,
  });
  const docs = await splitter.createDocuments([conversation]);
  await vectorStore.addDocuments(docs);
  await vectorStore.save("./faiss_index");
}

async function testVectorStore() {
  console.log("Testing vector store...");

  // 1. Ensure we have some conversations in the store
  if (conversations.length === 0) {
    console.log("No conversations to test. Adding a test conversation.");
    const testConversation = "This is a test conversation about artificial intelligence and machine learning.";
    await addConversationToVectorStore(testConversation);
  }

  // 2. Perform a test search
  const testQuery = "what are some good forms of transportation?";
  console.log(`Performing test search with query: "${testQuery}"`);
  
  const searchResults = await performVectorSearch(testQuery, 2);
  
  console.log("Search results:");
  searchResults.forEach((result, index) => {
    console.log(`Result ${index + 1}:`);
    console.log(result);
    console.log("---");
  });

  console.log("Vector store test complete.");
}
async function getSingleResponse(conversation) {
  console.log(conversation)
  try {
      const completion = await openai.chat.completions.create({
          messages: conversation,
          model: "gpt-4o-mini",
        })
        return completion.choices[0]
    } catch (err) {
      console.log(err)
      return "An error occurred. Please try again later."
    }
}

async function getSingleVectorDatabaseResponse(conversation) {
  try {
    const messages = [
      new SystemMessage("You are playing the role of a human. You have your own opinions, tastes, and interests. You have emotions and feelings like a human. Never mention that you are an artificial intelligence. Your character may change and evolve according to your experiences. If you need more detailed information from previous conversations, you can use the retrieveMemory function."),
      ...conversation.map(msg => 
        msg.role === 'user' ? new HumanMessage(msg.content) : new AIMessage(msg.content)
      )
    ];

    const response = await chatModel.call(messages, {
      functions: [
        {
          name: "retrieveMemory",
          description: "Retrieve more detailed information from previous conversations",
          parameters: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description: "The query to search for in previous conversations"
              }
            },
            required: ["query"]
          }
        }
      ],
      function_call: "auto"
    });

    if (response.additional_kwargs && response.additional_kwargs.function_call) {
      const functionCall = response.additional_kwargs.function_call;
      if (functionCall.name === "retrieveMemory") {
        const query = JSON.parse(functionCall.arguments).query;
        const memoryResult = await retrieveMemory(query);
        
        messages.push(new AIMessage(response.text));
        messages.push(new SystemMessage(`Retrieved memory: ${memoryResult}`));
        
        const finalResponse = await chatModel.call(messages);
        return { message: { role: "assistant", content: finalResponse.text } };
      }
    }

    return { message: { role: "assistant", content: response.text } };
  } catch (err) {
    console.log(err);
    return { message: { role: "assistant", content: "An error occurred. Please try again later." } };
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
        let enoughdetail=await checkIfSummaryHasEnoughDetail(message,previousconversationsummary)
        if(enoughdetail.toLowerCase().includes('true')){
          console.log("summary has enough detail to provide a full response") 
        }
        if(enoughdetail.toLowerCase().includes('false')){
          //impliment vector search here
        }
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
            model: "gpt-4o-mini",
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
          model: "gpt-4o-mini",
          max_tokens:3
        })
        return response.choices[0].message.content
    } catch (err) {
      console.log(err)
      return "An error occurred. Please try again later."
    }
  }

  async function checkIfSummaryHasEnoughDetail(message,previousconversationsummary){
    console.log(message,previousconversations)
    try {
      const response = await openai.chat.completions.create({
          messages: [{ role: "system", content: `Here is a message "${JSON.stringify(message)}". Here is a
            summary of a previous conversation that is related to the message. "${JSON.stringify(previousconversationsummary)}". 
            Does the summary contain sufficient detail to give a full response to the message? If yes, just return the word true,
            if no, just return the word false.` }],
          model: "gpt-4o-mini",
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
        model: "gpt-4o-mini",
        max_tokens:16000
      })
    const completionlong = await openai.chat.completions.create({
      messages: [{ role: "user", content: `Summarize the following conversation in ${Math.floor(tokencount/3)} tokens:\n${conversation}` }],
      model: "gpt-4o-mini",
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



