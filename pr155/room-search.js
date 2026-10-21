// Search room subjects, never incidental message mentions.
export function findProductRooms(rooms, query) {
  const words = String(query ?? '').normalize('NFKC').toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return rooms.filter(r => r.kind !== 'brand' && words.every(word =>
    [r.title_ko, r.title_en].some(title => String(title ?? '').normalize('NFKC').toLocaleLowerCase().includes(word))));
}

export function productRoomGroups(rooms, catalog = []) {
  const groups = new Map();
  for (const room of rooms.filter(r=>r.kind!=='brand')) {
    // Only classify a subject explicitly assigned by fixtures / the room, or an exact catalog name in its title.
    const product = room.topic_product ?? catalog.find(p => {
      const name=p.base_name??p.name;
      return name?.length>=4 && findProductRooms([room],name).length;
    });
    if (!product) continue;
    const name=product.label??[product.brand,product.base_name??product.name].filter(Boolean).join(' ');
    const key=product.id??product.family_key??name;
    if(!groups.has(key))groups.set(key,{id:key,name,image_url:product.image_url??'',rooms:[]});
    groups.get(key).rooms.push(room);
  }
  return [...groups.values()].sort((a,b)=>b.rooms.reduce((n,r)=>n+(r.messages_24h??0),0)-a.rooms.reduce((n,r)=>n+(r.messages_24h??0),0));
}
