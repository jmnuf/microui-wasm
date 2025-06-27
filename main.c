#include "extrn.h"
#include "microui/microui.h"

// 16px give or take is usually the browser default for 1 rem
#define FONT_SIZE 16

int text_width(mu_Font font, const char *str, int len) {
  if (len == -1) len = strlen(str);
  return len * FONT_SIZE;
}
int text_height(mu_Font font) {
  return FONT_SIZE;
}

typedef enum {
  UIA_BEGIN,
  UIA_END,

  UIA_WIN_INIT,
  UIA_WIN_END,

  UIA_BLOCK,

  UIA_MAX_ACTION_KIND
} UI_Action_Kind;

typedef struct {
  int options;
  mu_Command* head;
  mu_Command* tail;
} UIA_Win_Init;

typedef struct {
  mu_Command* head;
  mu_Command* tail;
} UIA_Block;

typedef struct {
  UI_Action_Kind kind;

  union {
    UIA_Win_Init win_init;
    UIA_Block win_end;
    UIA_Block block;
  };
} UI_Action;

typedef struct {
  UI_Action *items;
  size_t count;
  size_t capacity;
} UI_Actions;

void uia_append(UI_Actions *actions, UI_Action act) {
  if (actions->capacity == actions->count) {
    size_t new_cap = actions->capacity == 0 ? 64 : actions->capacity * 2;
    actions->items = realloc(actions->items, new_cap * sizeof(UI_Action));
  }
  actions->items[actions->count++] = act;
}

mu_Context g_ctx = {0};

UI_Actions actions = {0};

void init() {
  mu_Context *ctx = &g_ctx;

  mu_init(ctx);
  ctx->text_width = text_width;
  ctx->text_height = text_height;
}


void render_frame() {
  UI_Action action;
  mu_Context *ctx = &g_ctx;

  action = (UI_Action) { .kind = UIA_BEGIN };
  uia_append(&actions, action);
  mu_begin(ctx);

  if (mu_begin_window_ex(ctx, "Simple Window", mu_rect(0, 0, 400, 600), 0)) {
    mu_Container* container = mu_get_current_container(ctx);
    action = (UI_Action) {
      .kind = UIA_WIN_INIT,
      .win_init = { .options = 0, .head = container->head, .tail = container->tail },
    };
    uia_append(&actions, action);
    mu_label(ctx, "Some Label");

    container = mu_get_current_container(ctx);
    action = (UI_Action) {
      .kind = UIA_WIN_END,
      .win_end = { .head = container->head, .tail = container->tail },
    };
    uia_append(&actions, action);
    mu_end_window(ctx);
  }

  /*
  if (mu_begin_window(ctx, "Example Window", mu_rect(250, 0, 140, 86))) {
    mu_layout_row(ctx, 2, (int[]) { 60, -1 }, 0);

    mu_label(ctx, "First:");
    if (mu_button(ctx, "Button1")) {
      printf("Button1 pressed\n");
    }

    mu_label(ctx, "Second:");
    if (mu_button(ctx, "Button2")) {
      mu_open_popup(ctx, "My Popup");
    }

    if (mu_begin_popup(ctx, "My Popup")) {
      mu_label(ctx, "Hello world!");
      mu_end_popup(ctx);
    }

    mu_end_window(ctx);
  }
  */

  mu_end(ctx);
  action = (UI_Action) { .kind = UIA_END };
  uia_append(&actions, action);
}

void queue_commands() {
  size_t act_idx = 0;
  mu_Command *cmd = NULL;
  while (mu_next_command(&g_ctx, &cmd)) {
    UI_Action act = actions.items[act_idx];
    while (act.kind == UIA_BEGIN || act.kind == UIA_WIN_INIT) {
      js_ui_action(actions.items[act_idx].kind, 0);
      act = actions.items[++act_idx];
    }
    switch (cmd->type) {
      case MU_COMMAND_TEXT: js_draw_text(cmd->text.str, cmd->text.pos, cmd->text.color); break;
      case MU_COMMAND_RECT: js_draw_rect(cmd->rect.rect, cmd->rect.color); break;
      case MU_COMMAND_ICON: js_draw_icon(cmd->icon.id, cmd->icon.rect, cmd->icon.color); break;
      case MU_COMMAND_CLIP: js_set_clip_rect(cmd->clip.rect); break;
    }

    if (act.kind == UIA_WIN_END && act.win_end.tail == cmd) {
      js_ui_action(act.kind, &act.win_end);
      act = actions.items[++act_idx];
    }

    if (act.kind == UIA_BLOCK && act.block.tail == cmd) {
      js_ui_action(act.kind, &act.block);
      act = actions.items[++act_idx];
    }
  }

  for (UI_Action act; act_idx < actions.count; ++act_idx) {
    act = actions.items[act_idx];
    switch(act.kind) {
    case UIA_BEGIN:
    case UIA_END:
    case UIA_WIN_INIT:
      js_ui_action(act.kind, &act.win_init);
      break;
    case UIA_WIN_END:
      js_ui_action(act.kind, &act.win_end);
      break;
    case UIA_BLOCK:
      js_ui_action(act.kind, &act.block);
      break;
    case UIA_MAX_ACTION_KIND:
      break;
    }
  }
  actions.count = 0;
}

