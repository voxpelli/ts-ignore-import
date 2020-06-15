# Node CLI Template

Use this to create a new CLI-based tool

[![js-semistandard-style](https://img.shields.io/badge/code%20style-semistandard-brightgreen.svg?style=flat)](https://github.com/Flet/semistandard)

## Install

```bash
npm install -g @sydsvenskan/do-your-thing
```

## Syntax

```bash
do-your-thing \
  --option wow \
  --dry-run \
  maybe/a/path/to/something
```

## Flags

### Core Flags

* `--option` - specify the name of the Sentry organization of the project to sync with

### Additional Flags

* `--dry-run` - Runs everything as normal, but doesn't do any changes
* `--help` - When set, the help will be printed
* `--verbose` - When set, more verbose feedback will be surfaced
* `--version` - When set, this tools version will be printed
