#!/usr/bin/env bash
# for local generating abi, bin, and go binding
# usage: tools/gen_go_binding.sh [Sol file name] [genfiles path] [bindings path] [package name] [bindings file name]

set -e

SOL_NAME="$1" # do not include ".sol"
GENFILES_PATH="$2"
BINDINGS_PATH="$3"
PKG_NAME="$4"
FILE_NAME="$5"

mkdir -p $GENFILES_PATH
mkdir -p $BINDINGS_PATH/$PKG_NAME

# extract abi bin
jq .abi build/contracts/$SOL_NAME.json >$GENFILES_PATH/$SOL_NAME.abi
jq -r .bytecode build/contracts/$SOL_NAME.json >$GENFILES_PATH/$SOL_NAME.bin

# abigen files
abigen -abi $GENFILES_PATH/$SOL_NAME.abi -bin $GENFILES_PATH/$SOL_NAME.bin -pkg $PKG_NAME -type $SOL_NAME -out $BINDINGS_PATH/$PKG_NAME/$FILE_NAME.go
