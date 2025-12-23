.PHONY: help build build-cube build-cubestore clean

# Hardcoded build configuration
CUBE_IMAGE=cube-local:dev
CUBE_BUILD_CONTEXT=.
CUBE_DOCKERFILE=packages/cubejs-docker/dev.Dockerfile

CUBESTORE_IMAGE=cubestore-local:dev
CUBESTORE_BUILD_CONTEXT=rust
CUBESTORE_DOCKERFILE=cubestore/Dockerfile

help: ## Show this help message
	@echo 'Usage: make [target]'
	@echo ''
	@echo 'Available targets:'
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

build: ## Build all Docker images
	@echo "Building CUBE image: $(CUBE_IMAGE)"; \
	docker build \
		-t $(CUBE_IMAGE) \
		-f $(CUBE_BUILD_CONTEXT)/$(CUBE_DOCKERFILE) \
		$(CUBE_BUILD_CONTEXT)
	@echo "Building CUBESTORE image: $(CUBESTORE_IMAGE)"; \
	docker build \
		-t $(CUBESTORE_IMAGE) \
		-f $(CUBESTORE_BUILD_CONTEXT)/$(CUBESTORE_DOCKERFILE) \
		$(CUBESTORE_BUILD_CONTEXT)

build-cube: ## Build only the CUBE image
	@echo "Building CUBE image: $(CUBE_IMAGE)"; \
	docker build \
		-t $(CUBE_IMAGE) \
		-f $(CUBE_BUILD_CONTEXT)/$(CUBE_DOCKERFILE) \
		$(CUBE_BUILD_CONTEXT)

build-cubestore: ## Build only the CUBESTORE image
	@echo "Building CUBESTORE image: $(CUBESTORE_IMAGE)"; \
	docker build \
		-t $(CUBESTORE_IMAGE) \
		-f $(CUBESTORE_BUILD_CONTEXT)/$(CUBESTORE_DOCKERFILE) \
		$(CUBESTORE_BUILD_CONTEXT)

clean: ## Remove Docker images
	@if [ -n "$(CUBE_IMAGE)" ]; then \
		docker rmi $(CUBE_IMAGE) 2>/dev/null || true; \
	fi
	@if [ -n "$(CUBESTORE_IMAGE)" ]; then \
		docker rmi $(CUBESTORE_IMAGE) 2>/dev/null || true; \
	fi
