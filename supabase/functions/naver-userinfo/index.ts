import {naverUserinfo} from './handler.js';
Deno.serve(request => naverUserinfo(request));
