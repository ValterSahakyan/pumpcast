# Stage 1: Build the React app
FROM node:20-alpine as build-stage

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy the rest of the application code
COPY . .

# Build the app for production
RUN npm run build

# Stage 2: Serve the app with Nginx
FROM nginx:stable-alpine

# Copy the build output to Nginx's default public folder
# Note: we will mount this to the main nginx container or serve it here
COPY --from=build-stage /app/dist /usr/share/nginx/html/33zzadmin

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
