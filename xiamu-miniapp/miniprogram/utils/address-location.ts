export interface AddressLocation {
  latitude: number
  longitude: number
  addressDetail: string
  title: string
}

export interface AddressLocationMarker {
  id: number
  latitude: number
  longitude: number
  title: string
  width: number
  height: number
}

const toCoordinate = (value: unknown, minimum: number, maximum: number): number | null => {
  const coordinate = Number(value)
  return Number.isFinite(coordinate) && coordinate >= minimum && coordinate <= maximum ? coordinate : null
}

export const hasAddressLocation = (latitude: unknown, longitude: unknown): boolean => (
  toCoordinate(latitude, -90, 90) !== null && toCoordinate(longitude, -180, 180) !== null
)

export const buildAddressLocationMarkers = (
  latitude: unknown,
  longitude: unknown,
  title: string,
): AddressLocationMarker[] => {
  const normalizedLatitude = toCoordinate(latitude, -90, 90)
  const normalizedLongitude = toCoordinate(longitude, -180, 180)

  if (normalizedLatitude === null || normalizedLongitude === null) {
    return []
  }

  return [{
    id: 1,
    latitude: normalizedLatitude,
    longitude: normalizedLongitude,
    title: String(title || '').trim() || '收货地址',
    width: 28,
    height: 36,
  }]
}

const buildAddressDetail = (name: string, address: string): string => {
  if (!name) {
    return address
  }

  if (!address || address.includes(name)) {
    return address || name
  }

  return `${name} ${address}`
}

export const chooseAddressLocation = (
  initialLocation?: { latitude: number; longitude: number },
): Promise<AddressLocation> => new Promise((resolve, reject) => {
  const hasInitialLocation = initialLocation
    && hasAddressLocation(initialLocation.latitude, initialLocation.longitude)

  wx.chooseLocation({
    latitude: hasInitialLocation ? initialLocation.latitude : undefined,
    longitude: hasInitialLocation ? initialLocation.longitude : undefined,
    success: (result) => {
      const latitude = toCoordinate(result.latitude, -90, 90)
      const longitude = toCoordinate(result.longitude, -180, 180)

      if (latitude === null || longitude === null) {
        reject(new Error('未获取到有效的地图坐标'))
        return
      }

      const name = String(result.name || '').trim()
      const address = String(result.address || '').trim()
      resolve({
        latitude,
        longitude,
        addressDetail: buildAddressDetail(name, address),
        title: name || address || '收货地址',
      })
    },
    fail: (error) => {
      reject(error instanceof Error ? error : new Error(String(error.errMsg || '地图选点失败')))
    },
  })
})
