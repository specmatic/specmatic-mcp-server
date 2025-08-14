# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an MCP (Model Context Protocol) server that exposes Specmatic Contract Test capability, allowing coding agents to use it as a reference while implementing OpenAPI specification.

## Current State

This is a new/empty repository with only a basic README.md file. The project structure and implementation are yet to be created.

## Development Setup

Since this is a new repository, the development environment and build processes are not yet established. When implementing this MCP server, you will need to:

1. Determine the appropriate technology stack (likely Node.js/TypeScript for MCP servers)
2. Set up package.json with necessary dependencies
3. Implement the MCP server interface
4. Integrate with Specmatic for contract testing capabilities

## Reference Literature

Refer to https://docs.specmatic.io/getting_started.html for how to use Specmatic to run Contract Tests against an API

## Architecture Notes

As an MCP server, this project should follow the Model Context Protocol specification to expose Specmatic's contract testing functionality to AI coding agents. The server will need to provide tools/resources that agents can use to validate API implementations against OpenAPI specifications.
- always use nvm to use node stable version
- Never use Docker in Docker