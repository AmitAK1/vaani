# Vaani telephony engine — container image for Hugging Face Spaces (Docker SDK).
# HF routes traffic to port 7860, so the server listens there. All state lives in
# Supabase, so the container is stateless and needs no persistent disk.
FROM node:20-slim

ENV NODE_ENV=production
ENV PORT=7860

WORKDIR /app

# Install deps first for layer caching. tsx is a runtime dependency (not a devDep),
# so omitting dev still installs it and skips typescript/@types (not needed at runtime).
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

EXPOSE 7860

CMD ["npm", "run", "start"]
