#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${MSOA_ENV_FILE:-$ROOT_DIR/.env}"
ENV_EXAMPLE="$ROOT_DIR/.env.example"
COMPOSE_FILE="$ROOT_DIR/docker-compose.yml"

UI_URL="${MSOA_UI_URL:-https://msoa.actappon.com}"
API_URL="${MSOA_API_URL:-https://msoa.actappon.com/api}"
PGADMIN_URL="${MSOA_PGADMIN_URL:-http://localhost:5050}"

SERVICES=(db pgadmin collector pipeline llm executor ui-backend ui-frontend)
JOB_SERVICES=(collector llm executor)

if [[ -t 1 && -z "${NO_COLOR:-}" ]]; then
  RESET="$(printf '\033[0m')"
  BOLD="$(printf '\033[1m')"
  DIM="$(printf '\033[2m')"
  CYAN="$(printf '\033[36m')"
  GREEN="$(printf '\033[32m')"
  YELLOW="$(printf '\033[33m')"
  RED="$(printf '\033[31m')"
else
  RESET="" ; BOLD="" ; DIM="" ; CYAN="" ; GREEN="" ; YELLOW="" ; RED=""
fi

info() { printf "  %s\n" "$*"; }
green() { printf "  %s%s%s\n" "$GREEN" "$*" "$RESET"; }
yellow() { printf "  %s%s%s\n" "$YELLOW" "$*" "$RESET"; }
red() { printf "  %s%s%s\n" "$RED" "$*" "$RESET"; }

trim() {
  local value="$1"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  printf "%s" "$value"
}

load_env_file() {
  [[ -f "$ENV_FILE" ]] || return 0

  local line key value quoted
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="$(trim "$line")"
    case "$line" in
      ""|\#*) continue ;;
    esac

    if [[ "$line" =~ ^([A-Za-z_][A-Za-z0-9_]*)[[:space:]]*=(.*)$ ]]; then
      key="${BASH_REMATCH[1]}"
      value="$(trim "${BASH_REMATCH[2]}")"
      quoted="false"

      if [[ "$value" =~ ^\"(.*)\"$ ]] || [[ "$value" =~ ^\'(.*)\'$ ]]; then
        value="${BASH_REMATCH[1]}"
        quoted="true"
      fi

      if [[ "$quoted" == "false" && "$value" =~ ^(.*)[[:space:]]+\#.*$ ]]; then
        value="$(trim "${BASH_REMATCH[1]}")"
      fi

      export "$key=$value"
    fi
  done < "$ENV_FILE"
}

load_env_file

POSTGRES_USER="${POSTGRES_USER:-msoa_user}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-msoa_pass}"
POSTGRES_DB="${POSTGRES_DB:-msoa_db}"
LOCAL_DATABASE_URL="${DATABASE_URL:-postgresql://$POSTGRES_USER:$POSTGRES_PASSWORD@127.0.0.1:5532/$POSTGRES_DB}"

print_header() {
  clear 2>/dev/null || true
  printf "\n"
  printf "  %sMSOA Operations%s\n" "$BOLD" "$RESET"
  printf "  %sMarket Signal & Outreach Assistant%s\n\n" "$DIM" "$RESET"
}

wait_key() {
  [[ -t 0 ]] || return 0
  printf "\n  %sPress any key to continue...%s" "$DIM" "$RESET"
  read -rsn1
  printf "\n"
}

command_exists() {
  command -v "$1" >/dev/null 2>&1
}

compose_kind() {
  if command_exists docker && docker compose version >/dev/null 2>&1; then
    printf "docker compose"
    return 0
  fi
  if command_exists docker-compose; then
    printf "docker-compose"
    return 0
  fi
  return 1
}

compose() {
  if command_exists docker && docker compose version >/dev/null 2>&1; then
    docker compose -f "$COMPOSE_FILE" "$@"
    return
  fi
  if command_exists docker-compose; then
    docker-compose -f "$COMPOSE_FILE" "$@"
    return
  fi
  red "Docker Compose is not available."
  info "Install Docker Desktop or the Docker Compose plugin, then try again."
  return 127
}

require_compose() {
  compose_kind >/dev/null || {
    red "Docker Compose is not available."
    info "Install Docker Desktop or the Docker Compose plugin, then try again."
    exit 1
  }
}

require_docker_daemon() {
  if command_exists docker && ! docker info >/dev/null 2>&1; then
    red "Docker is installed, but the daemon is not reachable."
    info "Start Docker Desktop, then try again."
    exit 1
  fi
}

require_runtime() {
  require_compose
  require_docker_daemon
}

require_curl() {
  command_exists curl || {
    red "curl is required for this command."
    exit 1
  }
}

valid_service() {
  local service="$1" candidate
  for candidate in "${SERVICES[@]}"; do
    [[ "$service" == "$candidate" ]] && return 0
  done
  return 1
}

valid_job_service() {
  local service="$1" candidate
  [[ "$service" == "all" ]] && return 0
  for candidate in "${JOB_SERVICES[@]}"; do
    [[ "$service" == "$candidate" ]] && return 0
  done
  return 1
}

is_placeholder() {
  local var_name="$1" value="$2"
  case "$var_name:$value" in
    GITHUB_TOKEN:12345|GCP_PROJECT_ID:your-gcp-proect-id|GOOGLE_APPLICATION_CREDENTIALS:/path/to/credential.json)
      return 0
      ;;
  esac
  return 1
}

check_var() {
  local var_name="$1" required="${2:-required}" value
  value="${!var_name:-}"

  if [[ -z "$value" ]] || is_placeholder "$var_name" "$value"; then
    if [[ "$required" == "required" ]]; then
      red "$var_name is missing"
    else
      yellow "$var_name is not set"
    fi
    return 1
  fi

  green "$var_name is set"
  return 0
}

pretty_json() {
  if command_exists python3; then
    python3 -m json.tool
  elif command_exists python; then
    python -m json.tool
  else
    cat
  fi
}

wait_for_db() {
  require_runtime
  local attempt
  for attempt in {1..30}; do
    if compose exec -T db pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" >/dev/null 2>&1; then
      green "Database is ready"
      return 0
    fi
    sleep 2
  done

  red "Database did not become ready in time."
  return 1
}

alembic_command() {
  if [[ -x "$ROOT_DIR/.venv/bin/alembic" ]]; then
    printf "%s\n" "$ROOT_DIR/.venv/bin/alembic"
    return 0
  fi
  if command_exists alembic; then
    command -v alembic
    return 0
  fi
  return 1
}

cmd_init_env() {
  if [[ -f "$ENV_FILE" ]]; then
    yellow "Env file already exists: $ENV_FILE"
    return 0
  fi
  if [[ ! -f "$ENV_EXAMPLE" ]]; then
    red "Missing template env file: $ENV_EXAMPLE"
    return 1
  fi

  cp "$ENV_EXAMPLE" "$ENV_FILE"
  green "Created $ENV_FILE from .env.example"
  info "Edit it before starting the full stack."
}

cmd_setup() {
  local kind
  printf "  %sSetup%s\n\n" "$BOLD" "$RESET"
  info "Project:      $ROOT_DIR"
  info "Compose file: $COMPOSE_FILE"
  info "Env file:     $ENV_FILE"
  info "UI:           $UI_URL"
  info "API:          $API_URL"
  info "PgAdmin:      $PGADMIN_URL"
  printf "\n"

  if command_exists docker; then
    green "Docker CLI found"
    if docker info >/dev/null 2>&1; then
      green "Docker daemon reachable"
    else
      yellow "Docker daemon is not reachable"
    fi
  else
    red "Docker CLI missing"
  fi

  if kind="$(compose_kind 2>/dev/null)"; then
    green "Compose found: $kind"
  else
    red "Compose missing"
  fi

  if [[ -f "$ENV_FILE" ]]; then
    green "Env file found"
  else
    yellow "Env file missing"
    info "Create one with: ./run.sh init-env"
  fi

  printf "\n  %sRequired configuration%s\n" "$BOLD" "$RESET"
  check_var GITHUB_TOKEN required || true
  check_var GCP_PROJECT_ID required || true
  check_var GOOGLE_APPLICATION_CREDENTIALS required || true
  check_var GEMINI_MODEL optional || true

  if [[ -n "${GOOGLE_APPLICATION_CREDENTIALS:-}" ]]; then
    if [[ -f "$GOOGLE_APPLICATION_CREDENTIALS" ]]; then
      green "GCP credentials file exists"
    else
      red "GCP credentials file not found: $GOOGLE_APPLICATION_CREDENTIALS"
    fi
  fi

  printf "\n  %sOptional configuration%s\n" "$BOLD" "$RESET"
  check_var REDDIT_CLIENT_ID optional || true
  check_var REDDIT_CLIENT_SECRET optional || true

  printf "\n  %sNext steps%s\n" "$BOLD" "$RESET"
  info "1. Fill .env with GitHub, Vertex AI, and optional Reddit values."
  info "2. Start from the main actappon project with: cd .. && ./run.sh"
  info "   Or start only MSOA after shared_proxy exists with: ./run.sh start"
  info "3. Open $UI_URL"
  info "4. Use ./run.sh logs all 120 true to live-tail the MSOA stack."

  printf "\n  %sExternal setup required%s\n" "$BOLD" "$RESET"
  info "Cloudflare DNS:"
  info "  - Add/update an A record: msoa.actappon.com -> this server public IP."
  info "  - Get this server public IP with: curl ipinfo.io/ip"
  info "  - Set proxy status to Proxied / orange-clouded."
  info "Cloudflare SSL/TLS:"
  info "  - Keep SSL/TLS mode as Flexible because the origin nginx listens on HTTP port 80."
  info "Main nginx routing:"
  info "  - The root actappon nginx routes msoa.actappon.com to ui-frontend:5173."
  info "  - The root actappon nginx routes msoa.actappon.com/api/ to ui-backend:8088."
  info "Docker network:"
  info "  - MSOA ui-frontend and ui-backend join the external shared_proxy network."
  info "  - If running MSOA standalone, create it first with: docker network create shared_proxy"
}

cmd_start() {
  require_runtime
  local targets=("$@")
  if [[ ${#targets[@]} -eq 0 ]]; then
    compose up --build -d
  else
    compose up --build -d "${targets[@]}"
  fi
  printf "\n"
  green "Stack started"
  info "UI:      $UI_URL"
  info "API:     $API_URL"
  info "PgAdmin: $PGADMIN_URL"
}

cmd_stop() {
  require_runtime
  if [[ $# -eq 0 ]]; then
    compose stop
  else
    compose stop "$@"
  fi
}

cmd_down() {
  require_runtime
  compose down
}

cmd_restart() {
  require_runtime
  if [[ $# -eq 0 ]]; then
    compose restart
  else
    compose restart "$@"
  fi
}

cmd_build() {
  require_runtime
  compose build "$@"
}

cmd_rebuild() {
  require_runtime
  compose build "$@"
  cmd_start "$@"
}

cmd_status() {
  require_runtime
  printf "  %sContainer Status%s\n\n" "$BOLD" "$RESET"
  compose ps

  printf "\n  %sEndpoints%s\n" "$BOLD" "$RESET"
  info "UI:      $UI_URL"
  info "API:     $API_URL"
  info "PgAdmin: $PGADMIN_URL"
  info "DB:      127.0.0.1:5532"

  if command_exists curl; then
    local json
    if json="$(curl -fsS "$API_URL/dashboard/services" 2>/dev/null)"; then
      printf "\n  %sService Dashboard%s\n" "$BOLD" "$RESET"
      printf "%s\n" "$json" | pretty_json | sed 's/^/  /'
    else
      printf "\n"
      yellow "API dashboard is not reachable yet."
    fi
  fi
}

cmd_logs() {
  require_runtime
  local service="${1:-all}"
  local lines="${2:-120}"
  local follow="${3:-false}"
  local log_args=(logs --tail "$lines")
  local targets=()

  if [[ "$service" =~ ^[0-9]+$ ]]; then
    lines="$service"
    service="all"
    log_args=(logs --tail "$lines")
  fi

  case "$follow" in
    true|1|yes|y|-f|--follow) log_args+=(-f) ;;
  esac

  if [[ "$service" != "all" ]]; then
    valid_service "$service" || {
      red "Unknown service: $service"
      info "Known services: ${SERVICES[*]}"
      return 1
    }
    targets=("$service")
  fi

  if [[ ${#targets[@]} -eq 0 ]]; then
    compose "${log_args[@]}"
  else
    compose "${log_args[@]}" "${targets[@]}"
  fi
}

cmd_migrate() {
  require_runtime
  compose up -d db
  wait_for_db

  local alembic_bin
  if ! alembic_bin="$(alembic_command)"; then
    red "Alembic is not installed in the local environment."
    info "Install dependencies with: python -m pip install -r requirements.txt"
    return 1
  fi

  DATABASE_URL="$LOCAL_DATABASE_URL" "$alembic_bin" upgrade head
  green "Migrations applied"
}

cmd_db_shell() {
  require_runtime
  compose up -d db
  wait_for_db
  compose exec db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"
}

cmd_shell() {
  require_runtime
  local service="${1:-}"
  if [[ -z "$service" ]]; then
    red "Usage: ./run.sh shell <service>"
    info "Known services: ${SERVICES[*]}"
    return 1
  fi
  valid_service "$service" || {
    red "Unknown service: $service"
    info "Known services: ${SERVICES[*]}"
    return 1
  }
  compose exec "$service" sh
}

cmd_trigger() {
  require_curl
  local service="${1:-collector}"
  valid_job_service "$service" || {
    red "Unknown job service: $service"
    info "Job services: ${JOB_SERVICES[*]}"
    return 1
  }
  [[ "$service" != "all" ]] || {
    red "Trigger accepts one service at a time."
    info "Usually: ./run.sh trigger collector"
    return 1
  }

  curl -fsS -X POST "$API_URL/system/run/$service"
  printf "\n"
  green "Triggered $service"
}

cmd_control() {
  require_curl
  local action="$1"
  local service="${2:-all}"

  valid_job_service "$service" || {
    red "Unknown job service: $service"
    info "Job services: all ${JOB_SERVICES[*]}"
    return 1
  }

  if [[ "$service" == "all" ]]; then
    curl -fsS -X POST "$API_URL/system/global/control" \
      -H "Content-Type: application/json" \
      --data "{\"action\":\"$action\"}"
  else
    curl -fsS -X POST "$API_URL/system/control/$service" \
      -H "Content-Type: application/json" \
      --data "{\"action\":\"$action\"}"
  fi
  printf "\n"
  green "$action sent to $service"
}

cmd_guide() {
  printf "  %sMSOA Operating Guide%s\n\n" "$BOLD" "$RESET"
  info "1. Configure .env with GITHUB_TOKEN, GCP_PROJECT_ID, GEMINI_MODEL, and GOOGLE_APPLICATION_CREDENTIALS."
  info "2. Start the stack with ./run.sh start."
  info "3. Open $UI_URL and review pending opportunities."
  info "4. Approve, edit, or reject drafts before executor posts anything."
  info "5. Use ./run.sh trigger collector for an ad-hoc harvest."
  info "6. Use ./run.sh pause all and ./run.sh resume all to control background job processors."
  info "7. Check logs with ./run.sh logs <service> 120 true when diagnosing service behavior."
  printf "\n"
  info "Useful service names: ${SERVICES[*]}"
}

cmd_help() {
  cat <<EOF
Usage: ./run.sh <command> [args]

Stack commands:
  setup                         Check Docker, env, credentials, and URLs
  init-env                      Create .env from .env.example when missing
  start|up [service...]         Build and start the stack or selected services
  stop [service...]             Stop the stack or selected services
  down                          Stop and remove stack containers
  restart [service...]          Restart the stack or selected services
  build [service...]            Build images
  rebuild [service...]          Build and start images
  status                        Show Compose status and API service dashboard
  logs [service|all] [N] [true] Show logs; pass true/-f to follow

Database commands:
  migrate                       Start db and run Alembic upgrade head locally
  db-shell                      Open psql in the db container

Service commands:
  shell <service>               Open a shell in a running service container
  trigger [collector]           Trigger an ad-hoc service run through the API
  pause [all|service]           Pause collector/llm/executor job processors
  resume [all|service]          Resume collector/llm/executor job processors
  stop-jobs [all|service]       Mark job processors as stopped in the API
  guide                         Show the recommended operating workflow
  interactive                   Open the interactive console
  help                          Show this help

Known services:
  ${SERVICES[*]}
EOF
}

ui_logs_menu() {
  print_header
  printf "  %sLogs%s\n\n" "$BOLD" "$RESET"
  printf "  Service [all]: "
  local service
  read -r service
  printf "  Lines [120]: "
  local lines
  read -r lines
  printf "  Follow live? [y/N]: "
  local follow_choice
  read -r follow_choice

  local follow="false"
  case "${follow_choice:-n}" in
    y|Y|yes|YES) follow="true" ;;
  esac

  printf "\n"
  cmd_logs "${service:-all}" "${lines:-120}" "$follow"
  wait_key
}

main_menu() {
  while true; do
    print_header
    printf "  %sMain Menu%s\n\n" "$BOLD" "$RESET"
    printf "  %s1%s)  Status\n" "$CYAN" "$RESET"
    printf "  %s2%s)  Setup\n" "$CYAN" "$RESET"
    printf "  %s3%s)  Start stack\n" "$CYAN" "$RESET"
    printf "  %s4%s)  Stop stack\n" "$CYAN" "$RESET"
    printf "  %s5%s)  Restart stack\n" "$CYAN" "$RESET"
    printf "  %s6%s)  Logs\n" "$CYAN" "$RESET"
    printf "  %s7%s)  Migrate database\n" "$CYAN" "$RESET"
    printf "  %s8%s)  Trigger collector\n" "$CYAN" "$RESET"
    printf "  %s9%s)  Pause jobs\n" "$CYAN" "$RESET"
    printf "  %s10%s) Resume jobs\n" "$CYAN" "$RESET"
    printf "  %s11%s) Guide\n" "$CYAN" "$RESET"
    printf "  %sq%s)  Quit\n\n" "$CYAN" "$RESET"
    printf "  Choice: "

    local choice
    read -r choice
    case "$choice" in
      1)
        print_header
        cmd_status
        wait_key
        ;;
      2)
        print_header
        cmd_setup
        wait_key
        ;;
      3)
        print_header
        cmd_start
        wait_key
        ;;
      4)
        print_header
        cmd_stop
        wait_key
        ;;
      5)
        print_header
        cmd_restart
        wait_key
        ;;
      6) ui_logs_menu ;;
      7)
        print_header
        cmd_migrate
        wait_key
        ;;
      8)
        print_header
        cmd_trigger collector
        wait_key
        ;;
      9)
        print_header
        cmd_control PAUSE all
        wait_key
        ;;
      10)
        print_header
        cmd_control RESUME all
        wait_key
        ;;
      11)
        print_header
        cmd_guide
        wait_key
        ;;
      q|Q)
        printf "\n"
        exit 0
        ;;
      *)
        yellow "Invalid choice"
        sleep 1
        ;;
    esac
  done
}

run_command() {
  local cmd="${1:-}"
  [[ $# -gt 0 ]] && shift || true

  case "$cmd" in
    setup) cmd_setup ;;
    init-env) cmd_init_env ;;
    start|up) cmd_start "$@" ;;
    stop) cmd_stop "$@" ;;
    down) cmd_down ;;
    restart) cmd_restart "$@" ;;
    build) cmd_build "$@" ;;
    rebuild) cmd_rebuild "$@" ;;
    status) cmd_status ;;
    logs) cmd_logs "$@" ;;
    migrate) cmd_migrate ;;
    db-shell) cmd_db_shell ;;
    shell) cmd_shell "$@" ;;
    trigger) cmd_trigger "$@" ;;
    pause) cmd_control PAUSE "${1:-all}" ;;
    resume) cmd_control RESUME "${1:-all}" ;;
    stop-jobs) cmd_control STOP "${1:-all}" ;;
    guide) cmd_guide ;;
    interactive) main_menu ;;
    help|-h|--help) cmd_help ;;
    "")
      if [[ -t 0 ]]; then
        main_menu
      else
        cmd_help
      fi
      ;;
    *)
      red "Unknown command: $cmd"
      printf "\n"
      cmd_help
      exit 1
      ;;
  esac
}

run_command "${@:-}"
