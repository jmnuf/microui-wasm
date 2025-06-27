import { createAllocator } from './allocator';
import { yp } from './grt';

function createEnv<T extends Record<string, any>>(base: T) {
  return new Proxy(base, {
    get(target, prop) {
      if (prop in target) {
        // @ts-ignore TS is stupid
        return target[prop];
      }
      return (...args: unknown[]) => {
        throw new Error(`Function '${String(prop)}(${args})' is not implemented yet`);
      };
    },
  });
}
export type pointer = number & { __wasm32: 'ptr'; };

export const mu = {
  Rect: function mu_Rect(mem: ArrayBuffer, ptr: pointer) {
    // 4 * i32
    const view = new DataView(mem, ptr, 16);
    return {
      get ptr() { return ptr; },

      get x() { return view.getInt32(0, true); },
      set x(v: number) { view.setInt32(0, v, true); },

      get y() { return view.getInt32(4, true); },
      set y(v: number) { view.setInt32(4, v, true); },

      get width() { return view.getInt32(8, true); },
      set width(v: number) { view.setInt32(8, v, true); },

      get height() { return view.getInt32(12, true); },
      set height(v: number) { view.setInt32(12, v, true); },

      get static() {
        return Object.freeze({
          ptr,
          x: view.getInt32(0, true),
          y: view.getInt32(4, true),
          width: view.getInt32(8, true),
          height: view.getInt32(12, true),
        });
      },
    };
  },

  Color: function mu_Color(mem: ArrayBuffer, ptr: pointer) {
    // 4 * i8
    const view = new Uint8ClampedArray(mem, ptr, 4);
    return {
      get ptr() { return ptr; },

      get r() { return view[0]; },
      set r(v: number) { view[0] = v; },

      get g() { return view[1]; },
      set g(v: number) { view[1] = v; },

      get b() { return view[2]; },
      set b(v: number) { view[2] = v; },

      get a() { return view[3]; },
      set a(v: number) { view[3] = v; },

      get static() {
        return Object.freeze({
          ptr,
          r: view[0],
          g: view[1],
          b: view[2],
          a: view[3],
        });
      },
    };
  },

  Vec2: function mu_Vec2(mem: ArrayBuffer, ptr: pointer) {
    // 2 * i32
    const view = new DataView(mem, ptr, 8);
    return {
      get ptr() { return ptr; },

      get x() { return view.getInt32(0, true); },
      set x(v: number) { view.setInt32(0, v, true); },

      get y() { return view.getInt32(4, true); },
      set y(v: number) { view.setInt32(4, v, true); },

      get static() {
        return Object.freeze({
          ptr,
          x: view.getInt32(0, true),
          y: view.getInt32(4, true),
        });
      },
    };
  },
};

export function ZString(mem: ArrayBuffer, ptr: pointer) {
  const buf = new Uint8ClampedArray(mem);
  const base = ptr;
  let str = '';
  let char = buf[ptr];
  let len = 0;
  while (char != 0) {
    ++len;
    str += String.fromCodePoint(char);
    char = buf[++ptr];
  }
  return {
    str, len,
    get ptr() { return base; },
    valueOf() { return str; },
    toString() { return str; },
  };
}
export declare namespace MU {
  export type Rect = ReturnType<typeof mu['Rect']>;
  export type Vec2 = ReturnType<typeof mu['Vec2']>;
  export type Color = ReturnType<typeof mu['Color']>;
}

export type zstring = ReturnType<typeof ZString>;

type MUCommand = 
  | {
  type: 'rect';
  rect: MU.Rect['static'];
  color: MU.Color['static'];
} | {
  type: 'text';
  text: zstring;
  pos: MU.Vec2['static'];
  color: MU.Color['static'];
} | {
  type: 'icon';
  id: number;
  rect: MU.Rect['static'];
  color: MU.Color['static'];
} | {
  type: 'clip';
  rect: MU.Rect['static'];
} | { type: 'unclip'; }
;

type UIACommand =
  | { type: 'ui:init' }
  | { type: 'ui:end' }
  | { type: 'win:init' }
  | { type: 'win:end' }
  | { type: 'ui:block' }
;

export type RenderCommand = MUCommand | UIACommand;

export function* get_module() {
  const queue = [] as Array<RenderCommand>;

  const env = createEnv({
    js_draw_rect(rect_ptr: pointer, color_ptr: pointer) {
      const rect = mu.Rect(mod.memory.buffer, rect_ptr).static;
      const color = mu.Color(mod.memory.buffer, color_ptr).static;
      // console.log('rect:', { x: rect.x, y: rect.y, w: rect.width, h: rect.height });
      // console.log('color:', { r: color.r, g: color.g, b: color.b, a: color.a });

      queue.unshift({ type: 'rect', rect, color });
    },

    js_draw_text(text_ptr: pointer, pos_ptr: pointer, color_ptr: pointer) {
      const text = ZString(mod.memory.buffer, text_ptr);
      const pos = mu.Vec2(mod.memory.buffer, pos_ptr).static;
      const color = mu.Color(mod.memory.buffer, color_ptr).static;
      // console.log('text:', { str: text.str, len: text.len });
      // console.log('pos:', { x: pos.x, y: pos.y });
      // console.log('color:', { r: color.r, g: color.g, b: color.b, a: color.a });

      queue.unshift({ type: 'text', text, pos, color });
    },

    js_draw_icon(id: number, rect_ptr: pointer, color_ptr: pointer) {
      // int id, mu_Rect rect, mu_Color color
      const rect = mu.Rect(mod.memory.buffer, rect_ptr).static;
      const color = mu.Color(mod.memory.buffer, color_ptr).static;

      queue.unshift({ type: 'icon', id, rect, color });
    },

    js_set_clip_rect(rect_ptr: pointer) {
      const rect = mu.Rect(mod.memory.buffer, rect_ptr).static;

      if (rect.x === 0 && rect.y === 0 && rect.width >= 0x1000000 && rect.height >= 0x1000000) {
        queue.unshift({ type: 'unclip' });
        return;
      }
      queue.unshift({ type: 'clip', rect });
    },

    js_ui_action(kind: number, data_ptr: pointer) {
      switch (kind) {
        case 0: {
          queue.unshift({ type: 'ui:init' });
          return;
        }
        case 1: {
          queue.unshift({ type: 'ui:end' });
          return;
        }

        case 2: {
          queue.unshift({ type: 'win:init' });
          return;
        }
        case 3: {
          queue.unshift({ type: 'win:end' });
          return;
        }

        case 4: {
          queue.unshift({ type: 'ui:block' });
          return;
        }
      }
      throw new Error(`TODO: Implement 'js_ui_action(kind: ${kind}, data_ptr: ${data_ptr})'`);
    },

    js_extra_command(...args: unknown[]) {
      throw new Error(`TODO: Implement 'js_extra_command(${args})'`);
    },

    printf(fmt_ptr: pointer, ...elems: unknown[]) {
      const fmt = ZString(mod.memory.buffer, fmt_ptr);
      console.log(fmt.str);
      if (elems.length == 1 && elems[0] == 0) return;
      throw new Error(`Function 'printf(${[...arguments]})' is not implemented yet`);
    },

    strlen(ptr: pointer) {
      const buf = new Uint8ClampedArray(mod.memory.buffer);
      let char = buf[ptr];
      let len = 0;
      while (char != 0) {
        ++len;
        char = buf[++ptr];
      }
      return len;
    },

    memset(ptr: pointer, value: number, size: number) {
      const view = new Uint8Array(mod.memory.buffer, ptr, size);
      for (let i = 0; i < view.length; ++i) {
        view[i] = value;
      }
    },

    memcpy(dst_ptr: pointer, src_ptr: pointer, size: number) {
      if (dst_ptr === 0) { throw new Error('SEGV: Attempting to copy bytes onto a NULL buffer'); }
      if (src_ptr === 0) { throw new Error('SEGV: Attempting to copy bytes from a NULL buffer'); }

      const dst_view = new Uint8Array(mod.memory.buffer, dst_ptr, size);
      const src_view = new Uint8Array(mod.memory.buffer, src_ptr, size);
      for (let i = 0; i < src_view.length; ++i) {
        dst_view[i] = src_view[i];
      }
      return dst_ptr;
    },

    malloc(size: number) { return allocator.malloc(size); },
    realloc(ptr: pointer, size: number) { return allocator.realloc(ptr, size); },
    free(ptr: pointer) { return allocator.free(ptr); },

    qsort(arr_ptr: pointer, arr_len: number, elem_size: number, cmp_fn: number): void {
      if (arr_len <= 1) return;
      const buf = mod.memory.buffer;
      const list = [] as Array<{ ptr: pointer, bytes: Uint8Array; }>;
      for (let i = 0; i < arr_len; ++i) {
        const ptr = (arr_ptr + (i * elem_size)) as pointer;
        const bytes = new Uint8Array(buf, ptr, elem_size);
        list.push({ ptr, bytes });
      }
      const cmp = mod.fn_table.get(cmp_fn);
      list.sort((a, b) =>  cmp(a.ptr, b.ptr));
      for (let i = 0; i < list.length; ++i) {
        const item = list[i];
        const item_bytes = new Uint8Array(buf, arr_ptr + (i * elem_size), elem_size);
        for (let j = 0; j < item.bytes.length; ++j) {
          item_bytes[j] = item.bytes[j];
        }
      }
      // throw new Error(`TODO: 'qsort(arr_ptr: ${arr_ptr}, arr_len: ${arr_len}, elem_size: ${elem_size}, cmp_fn: ${cmp_fn})' is not implemented yet`);
    },
  });

  const wasm = yield* yp(WebAssembly.instantiateStreaming(fetch('/out.wasm'), { env }));

  const mod = {
    base: wasm.instance,
    get memory() { return wasm.instance.exports.memory as WebAssembly.Memory; },
    exports: {
      init: wasm.instance.exports.init as () => void,
      render_frame: wasm.instance.exports.render_frame as () => void,
      queue_commands: wasm.instance.exports.queue_commands as () => void,
    },
    get fn_table() { return wasm.instance.exports.__indirect_function_table as WebAssembly.Table; },
    read_memory: (ptr: pointer, length: number) => new DataView(mod.memory.buffer, ptr, length),

    commands: (function* (){
      while (true) {
        yield queue.pop();
      }
    })(),

    ui_actions: (function*() {
      const it = mod.commands;
      let space: (UIACommand & { blocks: Array<RenderCommand> }) | null = null;
      let blocks = [] as Array<RenderCommand>;
      while (true) {
        const step = it.next();
        if (!step.value) {
          yield null;
          continue;
        }

        const cmd = step.value;
        if (cmd.type.startsWith('ui:') || cmd.type.startsWith('win:')) {
          space = { type: cmd.type, blocks };
          yield space;
          space = null;
          blocks = [];
          continue;
        }

        blocks.push(cmd);
      }
    })(),
  };

  const allocator = createAllocator().bind({
    memory: mod.memory,
    heap_base: wasm.instance.exports.__heap_base as WebAssembly.Global,
    heap_end: wasm.instance.exports.__heap_end as WebAssembly.Global,
  });

  return mod;
}

