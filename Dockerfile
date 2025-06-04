# Use an official Node.js runtime as a parent image
FROM node:14-alpine

# Set the working directory in the container
WORKDIR /app

# Copy package.json and package-lock.json to the working directory
# This helps in leveraging Docker layer caching
COPY package*.json ./

# Install application dependencies
RUN npm install

# Copy the rest of the application code to the working directory
COPY . .

# Create necessary directories
RUN mkdir -p uploads public/generated

# Set proper permissions
RUN chmod +x server.js && \
    chmod 755 uploads && \
    chmod 755 public/generated

# Expose the port your application listens on
EXPOSE 3000

# Define the command to run your application
ENTRYPOINT ["node", "server.js"]