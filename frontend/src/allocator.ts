import type { pointer } from './wasm-module';

interface MemoryInfo {
  memory: WebAssembly.Memory;
  heap_base: WebAssembly.Global;
  heap_end: WebAssembly.Global;
}
interface MemoryBlock {
  occupied: boolean;
  at: pointer;
  next: pointer;
  size: number;
}

interface MemorySpace extends MemoryInfo {
  heap_ptr: pointer;
  blocks: Map<pointer, MemoryBlock>;
}

function find(it: Iterator<[pointer, MemoryBlock]>, predicate: (value: [pointer, MemoryBlock]) => boolean): ([pointer, MemoryBlock] | undefined) {
  let step = it.next();
  while (!step.done) {
    if (predicate(step.value)) return step.value;
    step = it.next();
  }
  return undefined;
}

// TODO: Make it possible to free memory, maybe do some blocks or just clear all IDK
export function createAllocator() {
  const get_data = (space: MemorySpace, base_block: MemoryBlock) => {
    const data = [];
    let block: MemoryBlock | undefined = base_block;
    while (block != null) {
      data.push(...new Uint8Array(space.memory.buffer, block.at, block.size));
      block = space.blocks.get(block.next);
    }
    return data;
  };
  const get_full_size = (space: MemorySpace, base_block: MemoryBlock) => {
    let size = 0;
    let block: MemoryBlock | undefined = base_block;
    while (block != null) {
      size += block.size;
      block = space.blocks.get(block.next);
    }
    return size;
  };

  const malloc = (space: MemorySpace, size: number): pointer => {
    // 8 byte alignment
    if (size % 8 !== 0) size = (size + 7) & ~7;

    let block = find(space.blocks.entries(), ([_, s]) => s.size == size && s.occupied == false);
    if (block) {
      const [pointer, info] = block;
      info.occupied = true;
      info.next = 0 as pointer;
      return pointer;
    }
    block = find(space.blocks.entries(), ([_, s]) => {
      if (s.occupied) return false;
      if (s.size > size) return false;
      if (s.next == 0) return false;
      const n = space.blocks.get(s.next);
      if (!n) return false;
      // TODO: Probably make sure this situation is not possible here
      if (n.occupied) {
        s.next = 0;
        return false;
      }
      return s.size + n.size >= size;
    });
    if (block) {
      const [pointer, info] = block;
      info.occupied = true;
      const n = space.blocks.get(info.next)!;
      n.occupied = true;
      n.next = 0;
      return pointer;
    }

    if (space.heap_ptr + size > space.heap_end.value) {
      try {
        while (space.heap_ptr + size > space.heap_end.value) {
          space.memory.grow(1);
        }
      } catch (e) {
        console.error(e);
        console.error('Out of Memory. Should grow the wasm memory!');
        const available = space.heap_end.value - space.heap_base.value;
        const diff = size - available;
        console.log(`Attempting to allocate ${size} bytes but only have ${available} bytes.\n      ${diff} bytes overflow`);
        return 0 as pointer;
      }
    }

    const ptr = space.heap_ptr;
    space.heap_ptr = (space.heap_ptr + size) as pointer;
    space.blocks.set(ptr, { occupied: true, at: ptr, next: 0 as pointer, size });
    return ptr;
  };

  const realloc = (space: MemorySpace, ptr: pointer, size: number): pointer => {
    if (ptr === 0) return malloc(space, size);
    const old_block = space.blocks.get(ptr);

    // Maybe should error report this?
    if (old_block === undefined) return malloc(space, size);
    const data = get_data(space, old_block);
    free(space, ptr);

    const new_ptr = malloc(space, size);
    // No more space I guess
    if (new_ptr === 0) return new_ptr;
    const view = new Uint8Array(space.memory.buffer, new_ptr, size);
    for (let i = 0; i < Math.min(data.length, size); ++i) {
      view[i] = data[i];
    }
    return new_ptr;
  };

  const free = (space: MemorySpace, ptr: pointer) => {
    if (ptr == 0) {
      console.error('Attempting to free a NULL pointer');
      return;
    }
    console.warn('freeing memory is not properly supported yet.');
    let block = space.blocks.get(ptr);
    while (block != null) {
      let currently_occupied = block.occupied;
      block.occupied = false;
      if (block.next == 0) break;
      block = space.blocks.get(block.next);
      if (currently_occupied && !block.occupied) console.warn('Used block was pointing to unoccupied memory! Undefined behavioru may have occured');
    }
  };

  return {
    malloc,
    realloc,
    free,
    bind: (info: MemoryInfo) => {
      const space: MemorySpace = {
        ...info,
        heap_ptr: info.heap_base.value,
        blocks: new Map(),
      };
      return {
        malloc: malloc.bind(null, space),
        free: free.bind(null, space),
        realloc: realloc.bind(null, space),
      }
    },
  };
}

