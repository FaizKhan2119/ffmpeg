FROM node:18

# Install ffmpeg
RUN apt-get update && apt-get install -y ffmpeg

# Set app directory
WORKDIR /app

# Copy files
COPY . .

# Install dependencies
RUN npm install

# Start the worker
CMD ["node", "index.js"]
