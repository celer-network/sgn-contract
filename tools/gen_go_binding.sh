#!/usr/bin/env bash
# for local generating abi, bin, and go binding
# usage: tools/gen_go_binding.sh [Sol file name] [output path] [package name]

set -e

SOLNAME="$1"  # do not include ".sol"
OUTPUTPATH="$2"
PKGNAME="$3"

mkdir -p $OUTPUTPATH

# extract abi bin
jq .abi build/contracts/$SOLNAME.json > $OUTPUTPATH/$SOLNAME.abi
jq -r .bytecode build/contracts/$SOLNAME.json > $OUTPUTPATH/$SOLNAME.bin

# abigen files
abigen -abi $OUTPUTPATH/$SOLNAME.abi -bin $OUTPUTPATH/$SOLNAME.bin -pkg $PKGNAME -type $SOLNAME -out $OUTPUTPATH/$PKGNAME.go
