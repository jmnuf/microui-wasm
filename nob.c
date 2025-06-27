#define NOB_STRIP_PREFIX
#define NOB_IMPLEMENTATION
#include "nob.h"

int main(int argc, char **argv) {
  NOB_GO_REBUILD_URSELF(argc, argv);

  Cmd cmd = {0};
  // clang --target=wasm32-wasi -O2 -o output.wasm input.c --sysroot=/path/to/wasi-sdk/share/wasi-sysroot
  cmd_append(&cmd, "clang", "--target=wasm32");
  cmd_append(&cmd, "-fno-builtin", "--no-standard-libraries");
  cmd_append(&cmd, "-Wl,--no-entry", "-Wl,--allow-undefined");

  // cmd_append(&cmd, "-Wl,--export-all");
  cmd_append(&cmd, "-Wl,--export=init");
  cmd_append(&cmd, "-Wl,--export=render_frame");
  cmd_append(&cmd, "-Wl,--export=queue_commands");

  cmd_append(&cmd, "-Wl,--export=__heap_base");
  cmd_append(&cmd, "-Wl,--export=__heap_end");
  cmd_append(&cmd, "-Wl,--export=__indirect_function_table");
  cmd_append(&cmd, "-I.");
  cmd_append(&cmd, "-I./thirdparty");
  cmd_append(&cmd, "./main.c", "./thirdparty/microui/microui.c");
  cmd_append(&cmd, "-o", "./frontend/public/out.wasm");

  if (!cmd_run_sync_and_reset(&cmd)) return 1;

  return 0;
}

