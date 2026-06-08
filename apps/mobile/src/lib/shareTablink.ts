import { Platform, Share } from 'react-native';

type ShareTablinkOptions = {
  tablinkUrl: string;
  merchantName?: string | null;
};

export function buildTablinkShareIntro(merchantName?: string | null) {
  const merchantDisplay = merchantName ? ` (${merchantName})` : '';
  return `Split the bill with me!${merchantDisplay}`;
}

export function shareTablink({ tablinkUrl, merchantName }: ShareTablinkOptions) {
  const intro = buildTablinkShareIntro(merchantName);

  if (Platform.OS === 'ios') {
    return Share.share({
      message: intro,
      url: tablinkUrl,
      title: 'Share Tablink',
    });
  }

  return Share.share({
    message: `${intro}\n${tablinkUrl}`,
    title: 'Share Tablink',
  });
}
