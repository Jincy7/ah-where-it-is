import { redirect } from 'next/navigation'
export default function NewContainerPage() {
  redirect('/storage?mode=manual&panel=new-container')
}
