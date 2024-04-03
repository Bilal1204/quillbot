import { db } from "@/db";
import { openai } from "@/lib/openai";
import { pinecone } from "@/lib/pinecone";
import { sendMessageValidator } from "@/lib/validators/SendMessageValidators";
import { getKindeServerSession } from "@kinde-oss/kinde-auth-nextjs/server";
import { OpenAIEmbeddings } from "@langchain/openai";
import { PineconeStore } from "@langchain/pinecone";
import { Pinecone } from "@pinecone-database/pinecone";
import { NextRequest } from "next/server";
import {StreamingTextResponse, OpenAIStream} from 'ai'

export const POST = async (req: NextRequest) =>{
    const body = await req.json()
    const {getUser} = getKindeServerSession()
    const user = await getUser()
    const {id: userId} = user
    if(!userId)
        return new Response('Unauthorized', {status: 401})

    const {fileId, message} = sendMessageValidator.parse(body)

    const file = await db.file.findFirst({
        where:{
            id: fileId,
            userId
        }
    })

    if(!file)
        return new Response('File not found', {status: 404})

    await db.message.create({
        data:{
            text: message,
            isUserMessage: true,
            userId,
            fileId
        }
    })

    const embeddings = new OpenAIEmbeddings({
        openAIApiKey: process.env.OPENAI_API_KEY!
    })

    const pineconeIndex = pinecone.Index('quillbot')
    
    const vectorStore = await PineconeStore.fromExistingIndex(embeddings, {
        pineconeIndex,
        namespace: file.id
    })

    const results = await vectorStore.similaritySearch(message, 4)

    const prevMessages = await db.message.findMany({
        where:{
            fileId
        },
        orderBy:{
            createdAt: 'asc'
        },
        take: 6
    })

    const formattedPrevMessages = prevMessages.map((msg) =>({
        role: msg.isUserMessage ? 'user' as const : 'assistant' as const,
        content: msg.text
    }))

    const response = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        temperature:0,
        stream: true,
        messages:[
            {
                role: 'system',
                content: 'Use the following piece of context (or previous conversation if needed) to answer the users questions in markdown format',
            },
            {
                role: 'user',
                content: `Use the following piece of context (or previous conversation if needed) to answer the users question in markdown format. \nIf you dont just say you dont know, dont try to make up answers.
                
                \n-----------------\n
                PREVIOUS MESSAGES:
                ${formattedPrevMessages.map((message) =>{
                    if(message.role === 'user')
                        return `User: ${message.content}\n`
                    return `Assistant: ${message.content}\n`
                })}
                
                \n-----------------\n

                CONTEXT:
                ${results.map((r) => r.pageContent).join('\n\n')}
                
                USER INPUT: ${message}`,
            },],
    })

    const stream = OpenAIStream(response,{
        async onCompletion(completion){
            await db.message.create({
                data:{
                    text: completion,
                    isUserMessage: false,
                    fileId,
                    userId
                }
            })    
        }       
    })

    return new StreamingTextResponse(stream)
}