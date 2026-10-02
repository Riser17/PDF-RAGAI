import { Worker } from 'bullmq';
import { OllamaEmbeddings } from '@langchain/ollama';
import { QdrantVectorStore } from "@langchain/qdrant";
import { QdrantClient } from "@qdrant/js-client-rest";
import { Document } from "@langchain/core/documents";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { CharacterTextSplitter, RecursiveCharacterTextSplitter} from "@langchain/textsplitters";
import { connect } from 'node:http2';

const worker = new Worker(
  'file-upload-queue',
  async job => {
    console.log("============================");
    console.log("JOB RECEIVED", job.data);
    console.log("============================");
    const data = JSON.parse(job.data);
    /*Path: data.path
    read the pof from path, 
    chunk the pdf,
    call the openai embedding model for every chunk, 
    store the chunk in qdrant db
    */

    // Load the PDF file
    const loader = new PDFLoader(data.path);
    const docs = await loader.load();

    const textSplitter = new RecursiveCharacterTextSplitter({
  chunkSize: 1000,     // characters, not tokens — see note below
  chunkOverlap: 200,
});

const splitDocs = await textSplitter.splitDocuments(docs); // note: splitDocuments (pl

    const client = new QdrantClient({ url: `http://localhost:6333` });



    const embeddings = new OllamaEmbeddings({
      model: "nomic-embed-text-v2-moe", // Default value
      baseUrl: "http://localhost:11434", // Default value
    });

    const vectorStore = await QdrantVectorStore.fromExistingCollection(
      embeddings,
      {
        url: "http://localhost:6333",
        collectionName: "pdf-docs",
      },
    );
    console.log('vectorStore',vectorStore);
    const prefixedDocs = splitDocs.map(d => ({
  ...d,
  pageContent: `search_document: ${d.pageContent}`,
}));
await vectorStore.addDocuments(prefixedDocs);
  
    console.log(`All Docs are added yo vector store 🏬`);
    

    // const textSplitter = new CharacterTextSplitter({
    //   chunkSize: 300,
    //   chunkOverlap: 0,
    // });

    // const texts = await textSplitter.splitText(docs);
    // console.log('Texts:',texts);
    
  },
  {
    connection: {
      host: 'localhost',                                                                                                                                                                                                                                                                                                                                                                  
      port: 6379,
    },
    concurrency: 100,
  }
);



// VERY IMPORTANT
worker.on('completed', job => {
  console.log(`✅ Job ${job.id} completed`);
});

worker.on('failed', (job, error) => {
  console.error(`❌ Job ${job?.id} failed`);
  console.error(error);
});

worker.on('error', error => {
  console.error('❌ Worker error:', error);
});