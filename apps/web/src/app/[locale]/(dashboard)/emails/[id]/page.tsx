import EmailComposer from "../_composer";

type Props = { params: Promise<{ id: string }> };

export default async function EditEmailTemplatePage({ params }: Props) {
  const { id } = await params;
  return <EmailComposer templateId={id} />;
}
