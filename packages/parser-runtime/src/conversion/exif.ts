import piexif from 'piexifjs'
import type { ExifCategory } from './index'

type ExifTagIfd = '0th' | 'Exif'
type MutableExifIfd = Record<number, unknown>
type MutableExifData = ReturnType<typeof piexif.load> & {
  '0th': MutableExifIfd
  Exif: MutableExifIfd
  GPS: MutableExifIfd
}

type RemoveAllExifMapping = {
  mode: 'removeAll'
  remove: (dataUrl: string) => string
}

type RemoveIfdExifMapping = {
  mode: 'removeIfd'
  ifd: 'GPS'
}

type RemoveTagsExifMapping = {
  mode: 'removeTags'
  tagsByIfd: Partial<Record<ExifTagIfd, readonly number[]>>
}

const PHOTOGRAPHIC_SENSITIVITY_TAG = 34855
const OFFSET_TIME_TAG = 36880
const OFFSET_TIME_ORIGINAL_TAG = 36881
const OFFSET_TIME_DIGITIZED_TAG = 36882

export type ExifCategoryTagMapping =
  | RemoveAllExifMapping
  | RemoveIfdExifMapping
  | RemoveTagsExifMapping

export const EXIF_CATEGORY_TAG_MAPPING = {
  all: {
    mode: 'removeAll',
    remove: piexif.remove
  },
  geolocation: {
    mode: 'removeIfd',
    ifd: 'GPS'
  },
  camera: {
    mode: 'removeTags',
    tagsByIfd: {
      '0th': [piexif.ImageIFD.Make, piexif.ImageIFD.Model],
      Exif: [
        piexif.ExifIFD.FNumber,
        piexif.ExifIFD.ExposureTime,
        piexif.ExifIFD.ISOSpeedRatings,
        PHOTOGRAPHIC_SENSITIVITY_TAG,
        piexif.ExifIFD.FocalLength,
        piexif.ExifIFD.FocalLengthIn35mmFilm,
        piexif.ExifIFD.LensMake,
        piexif.ExifIFD.LensModel,
        piexif.ExifIFD.LensSpecification,
        piexif.ExifIFD.ApertureValue,
        piexif.ExifIFD.ShutterSpeedValue,
        piexif.ExifIFD.ExposureProgram,
        piexif.ExifIFD.ExposureMode,
        piexif.ExifIFD.WhiteBalance,
        piexif.ExifIFD.Flash,
        piexif.ExifIFD.MeteringMode
      ]
    }
  },
  datetime: {
    mode: 'removeTags',
    tagsByIfd: {
      '0th': [piexif.ImageIFD.DateTime],
      Exif: [
        piexif.ExifIFD.DateTimeOriginal,
        piexif.ExifIFD.DateTimeDigitized,
        piexif.ExifIFD.SubSecTime,
        piexif.ExifIFD.SubSecTimeOriginal,
        piexif.ExifIFD.SubSecTimeDigitized,
        OFFSET_TIME_TAG,
        OFFSET_TIME_ORIGINAL_TAG,
        OFFSET_TIME_DIGITIZED_TAG
      ]
    }
  },
  software: {
    mode: 'removeTags',
    tagsByIfd: {
      '0th': [
        piexif.ImageIFD.Software,
        piexif.ImageIFD.ProcessingSoftware,
        piexif.ImageIFD.HostComputer
      ]
    }
  },
  authorCopyright: {
    mode: 'removeTags',
    tagsByIfd: {
      '0th': [
        piexif.ImageIFD.Artist,
        piexif.ImageIFD.Copyright,
        piexif.ImageIFD.ImageDescription,
        piexif.ImageIFD.XPAuthor,
        piexif.ImageIFD.XPComment,
        piexif.ImageIFD.XPKeywords,
        piexif.ImageIFD.XPSubject,
        piexif.ImageIFD.XPTitle
      ]
    }
  }
} as const satisfies Record<ExifCategory, ExifCategoryTagMapping>

const isJpegDataUrl = (dataUrl: string): boolean =>
  /^data:image\/(?:jpeg|jpg);base64,/i.test(dataUrl)

const hasExifTag = (ifd: MutableExifIfd | undefined, tag: number): boolean =>
  ifd !== undefined && tag in ifd

const removeExifTags = (
  exif: MutableExifData,
  tagsByIfd: Partial<Record<ExifTagIfd, readonly number[]>>
): boolean => {
  let removed = false

  for (const [ifd, tags] of Object.entries(tagsByIfd) as [ExifTagIfd, readonly number[]][]) {
    for (const tag of tags) {
      if (hasExifTag(exif[ifd], tag)) {
        delete exif[ifd][tag]
        removed = true
      }
    }
  }

  return removed
}

export const stripExifCategories = (dataUrl: string, categories: ExifCategory[]): string => {
  if (!isJpegDataUrl(dataUrl) || categories.length === 0) {
    return dataUrl
  }

  try {
    if (categories.includes('all')) {
      return EXIF_CATEGORY_TAG_MAPPING.all.remove(dataUrl)
    }

    const exif = piexif.load(dataUrl) as MutableExifData
    let changed = false

    for (const category of categories) {
      const mapping = EXIF_CATEGORY_TAG_MAPPING[category]

      if (mapping.mode === 'removeIfd') {
        if (Object.keys(exif[mapping.ifd]).length > 0) {
          exif[mapping.ifd] = {}
          changed = true
        }
        continue
      }

      if (mapping.mode === 'removeTags') {
        changed = removeExifTags(exif, mapping.tagsByIfd) || changed
      }
    }

    const orientationTag = piexif.ImageIFD.Orientation
    if (hasExifTag(exif['0th'], orientationTag) && exif['0th'][orientationTag] !== 1) {
      exif['0th'][orientationTag] = 1
      changed = true
    }

    return changed ? piexif.insert(piexif.dump(exif), dataUrl) : dataUrl
  } catch {
    return dataUrl
  }
}
