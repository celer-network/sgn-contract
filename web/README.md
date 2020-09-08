## Deployment

1. Install dependencies:

```shellscript
cd web
npm install
cd ..
```

2. In a separate terminal:

```shellscript
npx ganache-cli --gasLimit 8000000 --accounts 20
```

3. Compile the contracts:

```shellscript
npx truffle migrate
```

4. Edit the "networks" field in the artifact JSON files. Eg. `build/contracts/DPos.json`
5. Copy the artifacts to the web directory:

```shellscript
cp build/contracts/CELRToken.json build/contracts/DPoS.json build/contracts/SGN.json web/src/contracts
```

6. Build the web UI:

```shellscript
cd web
SKIP_PREFLIGHT_CHECK=true npm run build
```

7. Push the UI to the `gh-pages` branch:

```shellscript
npm run deploy
```

8. Check out the `gh-pages` branch:

```shellscript
git checkout gh-pages
```

9. Edit `index.html` to remove all references to `/sgn-contract`
10. Start Node HTTP server

```
http-server --port 80
```
