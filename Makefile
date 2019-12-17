.PHONY: update-web-contracts
update-web-contracts:
	truffle compile --all
	rm -rf web/src/contracts
	cp -r build/contracts web/src/