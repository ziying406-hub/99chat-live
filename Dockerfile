FROM golang:1.22-alpine AS build

WORKDIR /src/apps/api
COPY apps/api/go.mod apps/api/go.sum ./
RUN go mod download

COPY apps/api ./
RUN go build -o /out/server ./cmd/server

FROM alpine:3.20

WORKDIR /app
COPY --from=build /out/server /app/server
COPY apps/web /app/web

ENV PORT=8080
ENV WEB_DIR=/app/web
ENV UPLOAD_DIR=/app/uploads

EXPOSE 8080
CMD ["/app/server"]
