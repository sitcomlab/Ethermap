FROM node:16-alpine as build

# build dependencies for imagemin-gifsicle
RUN apk --update --no-cache \
		add  \
		automake \
		git \
		alpine-sdk  \
		nasm  \
		autoconf  \
		build-base \
		zlib \
		zlib-dev \
		libpng \
		libpng-dev\
		libwebp \
		libwebp-dev \
		libjpeg-turbo \
		libjpeg-turbo-dev

WORKDIR /usr/src/app

COPY package.json package-lock.json ./
RUN npm install && npm rebuild
COPY bower.json .bowerrc ./
RUN npm exec bower install --allow-root
COPY . ./
RUN npm run build


FROM node:16-alpine
ENV NODE_ENV=production
ENV PORT=8080
WORKDIR /usr/src/app
COPY --from=build /usr/src/app/dist /usr/src/app
# this time, only install prod dependencies
RUN npm install
EXPOSE ${PORT}
CMD [ "node", "server.js" ]
