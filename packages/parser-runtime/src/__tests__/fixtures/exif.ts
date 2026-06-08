import piexif from 'piexifjs'

type MutableExifIfd = Record<number, unknown>

type FixtureExifData = {
  '0th': MutableExifIfd
  Exif: MutableExifIfd
  GPS: MutableExifIfd
  Interop: MutableExifIfd
  '1st': MutableExifIfd
  thumbnail?: string
}

export const BASE_JPEG_DATA_URL =
  'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAH/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAEFAqf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/Aaf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/Aaf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAY/Aqf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/IV//2gAMAwEAAgADAAAAEP/EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQMBAT8QH//EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQIBAT8QH//EABQQAQAAAAAAAAAAAAAAAAAAABD/2gAIAQEAAT8QH//Z'

export const PNG_DATA_URL = 'data:image/png;base64,AAAA'
export const WEBP_DATA_URL = 'data:image/webp;base64,AAAA'
export const MALFORMED_JPEG_DATA_URL = 'data:image/jpeg;base64,not-a-valid-jpeg'
export const FIXTURE_MAKE = 'FixtureCam'
export const FIXTURE_MODEL = 'FixtureLensBody'
export const FIXTURE_DATETIME = '2026:06:08 10:11:12'
export const FIXTURE_SOFTWARE = 'FixtureEditor'
export const FIXTURE_ARTIST = 'Fixture Author'
export const FIXTURE_COPYRIGHT = 'Fixture Copyright'

export const createExifJpegDataUrl = (): string => {
  const exif: FixtureExifData = {
    '0th': {},
    Exif: {},
    GPS: {},
    Interop: {},
    '1st': {}
  }

  exif['0th'][piexif.ImageIFD.Make] = FIXTURE_MAKE
  exif['0th'][piexif.ImageIFD.Model] = FIXTURE_MODEL
  exif['0th'][piexif.ImageIFD.Orientation] = 6
  exif['0th'][piexif.ImageIFD.DateTime] = FIXTURE_DATETIME
  exif['0th'][piexif.ImageIFD.Software] = FIXTURE_SOFTWARE
  exif['0th'][piexif.ImageIFD.Artist] = FIXTURE_ARTIST
  exif['0th'][piexif.ImageIFD.Copyright] = FIXTURE_COPYRIGHT
  exif.GPS[piexif.GPSIFD.GPSLatitudeRef] = 'N'
  exif.GPS[piexif.GPSIFD.GPSLatitude] = [
    [1, 1],
    [2, 1],
    [3, 1]
  ]

  return piexif.insert(piexif.dump(exif), BASE_JPEG_DATA_URL)
}
