#!/bin/bash

# Kodecraft Docker Helper Script
# Usage: ./docker-helper.sh [command]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[$(date +'%H:%M:%S')]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Check if docker is installed
check_docker() {
    if ! command -v docker &> /dev/null; then
        print_error "Docker is not installed"
        exit 1
    fi
    if ! command -v docker-compose &> /dev/null; then
        print_error "Docker Compose is not installed"
        exit 1
    fi
}

# Build the Docker image
build() {
    print_status "Building Docker image..."
    docker build -t kodecraft:latest .
    print_status "Build complete!"
}

# Build without cache
build_fresh() {
    print_status "Building Docker image (no cache)..."
    docker build --no-cache -t kodecraft:latest .
    print_status "Build complete!"
}

# Start services
start() {
    print_status "Starting Kodecraft services..."
    docker-compose up -d
    print_status "Services started!"
    print_status "Leader bot available at: http://localhost:4001"
    sleep 2
    docker-compose logs -f
}

# Start services in foreground
start_fg() {
    print_status "Starting Kodecraft services (foreground)..."
    docker-compose up
}

# Stop services
stop() {
    print_status "Stopping Kodecraft services..."
    docker-compose down
    print_status "Services stopped!"
}

# View logs
logs() {
    docker-compose logs -f
}

# View logs for specific service
logs_service() {
    if [ -z "$1" ]; then
        print_error "Please specify a service (e.g., leader, postgres, n8n)"
        exit 1
    fi
    docker-compose logs -f "$1"
}

# Execute shell in container
shell() {
    docker-compose exec leader bash
}

# Check status
status() {
    print_status "Checking service status..."
    docker-compose ps
    
    print_status "Checking health..."
    if curl -s http://localhost:4001/api/agent/status > /dev/null 2>&1; then
        print_status "✓ Leader bot is healthy"
    else
        print_warning "✗ Leader bot is not responding"
    fi
}

# Restart services
restart() {
    print_status "Restarting Kodecraft services..."
    docker-compose restart
    print_status "Services restarted!"
}

# Clean up
clean() {
    print_warning "This will remove all containers and volumes. Continue? (y/n)"
    read -r response
    if [ "$response" = "y" ]; then
        print_status "Removing containers and volumes..."
        docker-compose down -v
        print_status "Cleanup complete!"
    else
        print_status "Cancelled"
    fi
}

# Remove image
clean_image() {
    print_warning "This will remove the Docker image. Continue? (y/n)"
    read -r response
    if [ "$response" = "y" ]; then
        print_status "Removing image..."
        docker rmi kodecraft:latest
        print_status "Image removed!"
    else
        print_status "Cancelled"
    fi
}

# Prune system
prune() {
    print_warning "This will remove all unused Docker resources. Continue? (y/n)"
    read -r response
    if [ "$response" = "y" ]; then
        print_status "Pruning Docker system..."
        docker system prune -a --volumes
        print_status "Prune complete!"
    else
        print_status "Cancelled"
    fi
}

# View container stats
stats() {
    docker stats kodecraft-leader
}

# Check if .env exists
check_env() {
    if [ ! -f .env ]; then
        print_warning ".env file not found!"
        print_status "Creating .env from .env.example..."
        if [ -f .env.example ]; then
            cp .env.example .env
            print_status "Created .env - please update with your values"
        else
            print_error ".env.example not found either"
            exit 1
        fi
    fi
}

# Setup (initial setup)
setup() {
    print_status "Setting up Kodecraft Docker environment..."
    check_env
    print_status "Building image..."
    build
    print_status "Setup complete! Run './docker-helper.sh start' to begin"
}

# Show help
help() {
    cat << EOF
${GREEN}Kodecraft Docker Helper${NC}

Usage: ./docker-helper.sh [command]

Commands:
    setup               Initial setup (build image, create .env)
    build               Build Docker image
    build-fresh         Build Docker image without cache
    start               Start services in background
    start-fg            Start services in foreground (with logs)
    stop                Stop services
    restart             Restart services
    logs                View logs (all services)
    logs [service]      View logs for specific service
    shell               Open bash in leader container
    status              Check service status and health
    stats               View container resource usage
    clean               Remove containers and volumes
    clean-image         Remove Docker image
    prune               Prune all unused Docker resources
    help                Show this help message

Examples:
    ./docker-helper.sh setup          # Initial setup
    ./docker-helper.sh start          # Start services
    ./docker-helper.sh logs leader    # View leader logs
    ./docker-helper.sh shell          # Open container shell
    ./docker-helper.sh status         # Check health

EOF
}

# Main script logic
main() {
    check_docker
    
    case "${1:-help}" in
        setup)
            setup
            ;;
        build)
            build
            ;;
        build-fresh)
            build_fresh
            ;;
        start)
            check_env
            start
            ;;
        start-fg)
            check_env
            start_fg
            ;;
        stop)
            stop
            ;;
        restart)
            restart
            ;;
        logs)
            if [ -z "$2" ]; then
                logs
            else
                logs_service "$2"
            fi
            ;;
        shell)
            shell
            ;;
        status)
            status
            ;;
        stats)
            stats
            ;;
        clean)
            clean
            ;;
        clean-image)
            clean_image
            ;;
        prune)
            prune
            ;;
        help)
            help
            ;;
        *)
            print_error "Unknown command: $1"
            help
            exit 1
            ;;
    esac
}

# Run main function
main "$@"
