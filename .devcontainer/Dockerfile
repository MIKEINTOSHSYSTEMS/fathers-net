# FathersNet dev container base image (Node 20 LTS, Debian-based).
# Node is provided by the devcontainers node feature; this image only installs
# base tooling (git, curl, bash) that the environment needs.
FROM node:20-bookworm

RUN apt-get update \
  && apt-get install -y --no-install-recommends git curl ca-certificates bash \
  && rm -rf /var/lib/apt/lists/*
