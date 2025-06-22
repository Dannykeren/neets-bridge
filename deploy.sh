cat > deploy.sh << 'EOF'
#!/bin/bash

echo "🎵 Neets Bridge Deployment Script"
echo "=================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if Docker is installed
check_docker() {
    if ! command -v docker &> /dev/null; then
        print_error "Docker is not installed. Installing Docker..."
        curl -fsSL https://get.docker.com -o get-docker.sh
        sudo sh get-docker.sh
        sudo usermod -aG docker $USER
        print_warning "Please logout and login again, then re-run this script"
        exit 1
    fi
    
    if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
        print_error "Docker Compose is not installed. Please install Docker Compose first."
        exit 1
    fi
    
    print_status "Docker is installed ✓"
}

# Function to get Neets device IP
get_neets_ip() {
    echo ""
    echo "📡 Neets Device Configuration"
    echo "----------------------------"
    
    # Try to detect current IP from docker-compose.yml if it exists
    current_ip=""
    if [ -f "docker-compose.yml" ]; then
        current_ip=$(grep "NEETS_IP=" docker-compose.yml | sed 's/.*NEETS_IP=//' | sed 's/[[:space:]]*$//')
        if [ ! -z "$current_ip" ]; then
            print_status "Current configured IP: $current_ip"
        fi
    fi
    
    echo ""
    echo "Please enter your Neets device IP address:"
    if [ ! -z "$current_ip" ]; then
        echo "(Press Enter to keep current: $current_ip)"
    fi
    read -p "Neets IP: " neets_ip
    
    # Use current IP if nothing entered
    if [ -z "$neets_ip" ] && [ ! -z "$current_ip" ]; then
        neets_ip="$current_ip"
    fi
    
    # Validate IP format (basic check)
    if [[ ! $neets_ip =~ ^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$ ]]; then
        print_error "Invalid IP address format. Please use format: 192.168.1.100"
        get_neets_ip
        return
    fi
    
    print_status "Using Neets IP: $neets_ip"
    
    # Test connectivity
    echo "Testing connectivity to $neets_ip..."
    if ping -c 1 -W 3 "$neets_ip" &> /dev/null; then
        print_status "✓ Can reach $neets_ip"
    else
        print_warning "⚠ Cannot ping $neets_ip - device might be unreachable"
        echo "Continue anyway? (y/n)"
        read -p "> " continue_anyway
        if [[ ! $continue_anyway =~ ^[Yy]$ ]]; then
            print_error "Deployment cancelled."
            exit 1
        fi
    fi
}

# Function to update docker-compose.yml with the IP
update_docker_compose() {
    print_status "Updating docker-compose.yml with IP: $neets_ip"
    
    # Use sed to replace the NEETS_IP line
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS version
        sed -i '' "s/NEETS_IP=.*/NEETS_IP=$neets_ip/" docker-compose.yml
    else
        # Linux version
        sed -i "s/NEETS_IP=.*/NEETS_IP=$neets_ip/" docker-compose.yml
    fi
    
    print_status "Configuration updated ✓"
}

# Function to build and start the container
deploy_container() {
    echo ""
    echo "🐳 Docker Deployment"
    echo "-------------------"
    
    print_status "Building Docker image..."
    docker compose build
    
    print_status "Starting Neets Bridge container..."
    docker compose up -d
    
    print_status "Container started! ✓"
}

# Function to check if deployment was successful
verify_deployment() {
    echo ""
    echo "🔍 Verifying Deployment"
    echo "----------------------"
    
    # Wait a bit for container to start
    sleep 5
    
    # Check if container is running
    if docker compose ps | grep -q "Up"; then
        print_status "✓ Container is running"
    else
        print_error "✗ Container is not running"
        echo "Checking logs..."
        docker compose logs --tail=20
        exit 1
    fi
    
    # Test HTTP endpoint
    local_ip=$(hostname -I | awk '{print $1}' 2>/dev/null || echo "localhost")
    
    print_status "Testing HTTP endpoint..."
    if curl -s -f "http://localhost:3000/status" > /dev/null; then
        print_status "✓ HTTP endpoint is responding"
    else
        print_warning "⚠ HTTP endpoint test failed - checking logs..."
        docker compose logs --tail=10
    fi
    
    echo ""
    echo "🎉 Deployment Summary"
    echo "===================="
    print_status "Neets Bridge is deployed and running!"
    echo ""
    echo "📋 Access Information:"
    echo "   • Local Status:  http://localhost:3000/status"
    echo "   • Network Access: http://$local_ip:3000/status"
    echo "   • Neets Device:  $neets_ip:5000"
    echo ""
    echo "📱 Stream Deck Setup:"
    echo "   • Install 'API Ninja' plugin"
    echo "   • Use base URL: http://$local_ip:3000"
    echo ""
    echo "🔧 Management Commands:"
    echo "   • View logs:     docker compose logs -f"
    echo "   • Stop service:  docker compose down"
    echo "   • Restart:       docker compose restart"
}

# Main deployment flow
main() {
    check_docker
    get_neets_ip
    update_docker_compose
    deploy_container
    verify_deployment
}

# Run main function
main

echo "Deploy script ready - edit as needed"
EOF
