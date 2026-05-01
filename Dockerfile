FROM node:20-alpine

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
# A wildcard is used to ensure both package.json AND package-lock.json are copied
COPY package*.json ./

RUN npm install --production

# Bundle app source
COPY . .

# Delete the extension folder from the server image to keep it lean
RUN rm -rf extension

# Expose port (default 3001)
EXPOSE 3001

# Start the server
CMD [ "npm", "start" ]
