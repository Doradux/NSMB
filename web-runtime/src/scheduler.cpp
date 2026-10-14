// W03: portable cooperative scheduling *state machine*, not native stackful fibers.
// Owns no Wii instructions or copyrighted game data. Single JS/Wasm main thread.
#include <array>
#include <cstdint>
#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#define EXPORT EMSCRIPTEN_KEEPALIVE
#else
#define EXPORT
#endif

namespace {
constexpr uint32_t kSlots = 8;
constexpr uint32_t kMaxSteps = 32;
constexpr uint32_t kTraceSize = kSlots * kMaxSteps;
constexpr uint32_t kReady = 1, kPaused = 2, kDone = 3;
struct Task {
  uint32_t id = 0, state = 0, limit = 0, pc = 0, value = 0, yields = 0;
};
std::array<Task, kSlots> tasks{};
std::array<uint32_t, kTraceSize> trace{};
uint32_t cursor = 0, traceCount = 0;
int lastError = 0;

Task* find(uint32_t id) {
  for (auto& task : tasks) if (task.id == id) return &task;
  return nullptr;
}
uint32_t count(uint32_t state) {
  uint32_t n = 0;
  for (const auto& task : tasks) if (task.id && task.state == state) ++n;
  return n;
}
} // namespace

extern "C" {
void EXPORT nsmbw_sched_reset() {
  tasks = {};
  trace = {};
  cursor = 0;
  traceCount = 0;
  lastError = 0;
}
int EXPORT nsmbw_sched_error() { return lastError; }
int EXPORT nsmbw_sched_spawn(uint32_t id, uint32_t steps) {
  lastError = 0;
  if (!id || steps == 0 || steps > kMaxSteps || find(id)) {
    lastError = 1;
    return 0;
  }
  for (auto& task : tasks) {
    if (task.id == 0) {
      task = Task{id, kReady, steps, 0, 0, 0};
      return 1;
    }
  }
  lastError = 2;
  return 0;
}
int EXPORT nsmbw_sched_suspend(uint32_t id) {
  lastError = 0;
  auto* task = find(id);
  if (!task || task->state != kReady) {
    lastError = 3;
    return 0;
  }
  task->state = kPaused;
  return 1;
}
int EXPORT nsmbw_sched_resume(uint32_t id) {
  lastError = 0;
  auto* task = find(id);
  if (!task || task->state != kPaused) {
    lastError = 3;
    return 0;
  }
  task->state = kReady;
  return 1;
}
// Dispatch exactly one synthetic instruction from one ready context.
// >0: dispatched guest ID; 0: all completed/empty; -1: all live tasks paused.
// No while-loop over guest code, no stack switching, no UI-thread blocking.
int EXPORT nsmbw_sched_step() {
  lastError = 0;
  for (uint32_t offset = 0; offset < kSlots; ++offset) {
    const uint32_t index = (cursor + offset) % kSlots;
    auto& task = tasks[index];
    if (task.id == 0 || task.state != kReady) continue;
    if (traceCount >= trace.size()) { lastError = 4; return -2; }
    cursor = (index + 1) % kSlots;
    ++task.pc;
    task.value += task.id * 100u + task.pc;
    trace[traceCount++] = (task.id << 8u) | task.pc;
    if (task.pc >= task.limit) task.state = kDone;
    else ++task.yields;
    return static_cast<int>(task.id);
  }
  return count(kPaused) ? -1 : 0;
}
// Bounded host-owned time slice. Never sleeps/spins while all threads wait.
int EXPORT nsmbw_sched_run_budget(uint32_t budget) {
  if (budget == 0 || budget > 1024) { lastError = 1; return -2; }
  for (uint32_t n = 0; n < budget; ++n) {
    const int result = nsmbw_sched_step();
    if (result <= 0) return static_cast<int>(n);
  }
  return static_cast<int>(budget);
}
uint32_t EXPORT nsmbw_sched_state(uint32_t id) {
  auto* task = find(id);
  return task ? task->state : 0;
}
uint32_t EXPORT nsmbw_sched_pc(uint32_t id) {
  auto* task = find(id);
  return task ? task->pc : 0;
}
uint32_t EXPORT nsmbw_sched_value(uint32_t id) {
  auto* task = find(id);
  return task ? task->value : 0;
}
uint32_t EXPORT nsmbw_sched_yields(uint32_t id) {
  auto* task = find(id);
  return task ? task->yields : 0;
}
uint32_t EXPORT nsmbw_sched_ready() { return count(kReady); }
uint32_t EXPORT nsmbw_sched_paused() { return count(kPaused); }
uint32_t EXPORT nsmbw_sched_done() { return count(kDone); }
uint32_t EXPORT nsmbw_sched_trace_length() { return traceCount; }
uint32_t EXPORT nsmbw_sched_trace_at(uint32_t pos) {
  if (pos >= traceCount) { lastError = 1; return 0; }
  lastError = 0;
  return trace[pos];
}
}
