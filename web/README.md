## Deployment

1. SKIP_PREFLIGHT_CHECK=true npm run build
1. npm run deploy
1. In the host server, check out sgn-contract repo and switch to gh-pages
1. edit `index.html` to remove `/sgn-contract`
1. start a http server
