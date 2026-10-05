# 🤖 InsightAI - RAG Powered PDF Chatbot

InsightAI is a high-performance, production-ready PDF chatbot built with **Next.js 16**, **Groq**, and **ChromaDB**. It uses Retrieval-Augmented Generation (RAG) to provide accurate answers based on your uploaded documents.

## ✨ Features
- **PDF Ingestion**: Upload documents up to 20MB with stable cloud parsing.
- **RAG Architecture**: Intelligent chunking and semantic search for context-aware answers.
- **Lightning Fast**: Powered by Groq's LPU for near-instant AI responses.
- **Optimized for Cloud**: Uses HuggingFace Inference API to keep the serverless footprint small and fast.
- **Glassmorphic UI**: A modern, premium dark-mode interface.

## 🛠️ Tech Stack
- **Framework**: [Next.js 16](https://nextjs.org) (App Router)
- **LLM**: [Groq](https://groq.com) (openai/gpt-oss-120b)
- **Vector Database**: [ChromaDB](https://www.trychroma.com/) (Hosted on Render)
- **Embeddings**: HuggingFace Inference API (`all-MiniLM-L6-v2`)
- **Styling**: Tailwind CSS + Glassmorphism

## 🚀 Deployment

### 1. Database (Render)
Deployed using the official `chromadb/chroma:latest` Docker image.
- **Instance**: Free Tier
- **Port**: 8000
- **Health Check**: `/api/v1/heartbeat`

### 2. Frontend (Vercel)
Deployed as a Next.js 16 application.
- **Root Directory**: `pdf-chatbot`
- **Environment Variables**:
    - `CHROMA_PATH`: Your Render service URL.
    - `GROQ_API_KEY`: Your Groq API key.
    - `HUGGINGFACE_API_KEY`: Your HuggingFace Access Token.

## 📦 Installation (Local)

1. **Clone and Install**:
```bash
npm install
```

2. **Environment Setup**:
Create a `.env.local` with your `CHROMA_PATH`, `GROQ_API_KEY`, and `HUGGINGFACE_API_KEY`.

3. **Run Dev**:
```bash
npm run dev
```

---
Built with ❤️ by [AUXID-01](https://github.com/AUXID-01)
