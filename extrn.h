
#ifndef _JS_EXTRN
#define _JS_EXTRN

#include "./microui/src/microui.h"

#ifndef NULL
  #define NULL 0
#endif

#ifndef stdin
#define stdin  0
#define stdout 1
#define stderr 2
#endif

typedef typeof(sizeof(0)) size_t;

int printf(const char* fmt, ...);
int fprintf(int fd, const char* fmt, ...);
void abort(void);

size_t strlen(const char* str);
char* sprintf(char* restrict buffer, const char* restrict fmt, ...);
void* memset(void* dest, int ch, size_t count);
void* memcpy(void* dest, const void* src, size_t size);
void* memccpy(void* dest, const void* src, int terminating_byte, size_t count);

void qsort(void* ptr, size_t count, size_t size, int (*comp)(const void* a, const void* b));
double strtod(const char* str, char** str_end);

void* malloc(size_t bytes);
void* realloc(void* ptr, size_t bytes);
void free(void* ptr);


void js_draw_text(char* text, mu_Vec2 position, mu_Color color);
void js_draw_rect(mu_Rect rect, mu_Color color);
void js_draw_icon(int id, mu_Rect rect, mu_Color color);
void js_set_clip_rect(mu_Rect rect);
void js_extra_command(int cmd_type, int n);
void js_ui_action(int type, void* action);

#endif // _JS_EXTRN

