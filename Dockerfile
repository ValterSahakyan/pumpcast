FROM node:20-alpine AS landing-build

WORKDIR /build/landing-react

COPY landing-react/package*.json ./
RUN npm install

COPY landing-react/ ./
RUN npm run build

FROM node:20-alpine

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install --omit=dev

COPY server.js ./
COPY services ./services
COPY store ./store
COPY --from=landing-build /build/landing-react/dist ./landing-react/dist

EXPOSE 3001

CMD ["npm", "start"]
