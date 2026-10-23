'use client';
import {useLanguage} from './locale';
export default function BridgeCTA(_:unknown){const {lang}=useLanguage(),ko=lang==='ko';return <section className="bridge-cta"><span>{ko?'이제 네 이야기를 들려줘.':'Now, tell your story.'}</span><h2>{ko?'비슷한 상황에서 너는 뭘 써?':'What do you use in a similar situation?'}</h2><p>{ko?'서울뷰티에서 경험을 나누고, 다른 사람의 추천도 만나봐.':'Share your experience and explore other people’s recommendations on Seoul Beauty.'}</p><a className="primary" href={ko?'/kr?lang=ko':'/us?lang=en'}>{ko?'서울뷰티에서 이야기하기':'Talk on Seoul Beauty'}</a></section>}
