Steps to run the application

1. Start a fresh instance of SurrealDB. Make sure old server is not running or else you could have duplicate embeddings. 
`surreal start memory -A --auth --user root --pass root`

2. On the IDE terminal, start the application server
`yarn run dev`
If something goes wrong, make sure you're on the correct version. Try doing `nvm use 18`

3. In another terminal, upload the images.
`sh upload.sh`

4. Wait until the embeddings and descriptions are generated

5. Ask your question via a POST request.
```sh
curl -X POST "http://localhost:8787/documents/ask" -H "Content-Type: application/json" -d '{"question":"Did the person visit a wedding recently?"}'
```

