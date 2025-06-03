# Use an official Node.js runtime as a parent image
FROM node:18-alpine

# Set the working directory in the container
WORKDIR /app

# Copy package.json and package-lock.json to the working directory
# This helps in leveraging Docker layer caching
COPY package*.json ./

# Install application dependencies
RUN npm install

# Copy the rest of the application code to the working directory
COPY . .

RUN chmod +x server.js

# Expose the port your application listens on
EXPOSE 3000

# Define the command to run your application
ENTRYPOINT ["node", "server.js"]